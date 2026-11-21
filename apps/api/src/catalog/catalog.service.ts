import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
} from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { toPage } from '../openapi/pagination.contract.js';
import {
  type Product,
  type ProductStatus,
  type ProductVariant,
  products,
  productVariants,
} from './catalog.schema.js';

type Metadata = Record<string, unknown>;

/** A product with its live (not deleted) variants, master first. */
export type ProductWithVariants = Product & { variants: ProductVariant[] };

export interface NewProduct {
  name: string;
  slug: string;
  description?: string;
  status: ProductStatus;
  /** SKU of the master variant. */
  sku: string;
  publicMetadata?: Metadata;
  privateMetadata?: Metadata;
}

export interface ProductChanges {
  name?: string;
  slug?: string;
  description?: string | null;
  status?: ProductStatus;
  publicMetadata?: Metadata;
  privateMetadata?: Metadata;
}

export interface VariantInput {
  sku?: string;
  position?: number;
  publicMetadata?: Metadata;
  privateMetadata?: Metadata;
}

/**
 * The variants that can be sold: the non-master ones, or the master when the
 * product has no others (Spree's rule). Carts, prices and stock use these.
 */
export function sellableVariants(variants: ProductVariant[]): ProductVariant[] {
  const options = variants.filter((v) => !v.isMaster);
  return options.length ? options : variants.filter((v) => v.isMaster);
}

/** `%` and `_` in a search term are literal characters, not wildcards. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The pre-checks give a readable message; the unique indexes are the real
 * guarantee when two requests race — their violation is a 409 as well.
 */
function conflictOnDuplicate(error: unknown): never {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  if ((cause?.code ?? code) === '23505') {
    throw new ConflictException('Slug or SKU is already used');
  }
  throw error;
}

const live = isNull(products.deletedAt);
const liveVariant = isNull(productVariants.deletedAt);

/**
 * Products and variants. The only code that reads or writes `products` and
 * `product_variants`; other modules will call it (INV-01 adds what it needs).
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(query: {
    limit: number;
    cursor?: string;
    status?: ProductStatus;
    q?: string;
  }): Promise<{ items: ProductWithVariants[]; nextCursor: string | null }> {
    const search = query.q ? likePattern(query.q) : undefined;
    const rows = await this.db
      .select()
      .from(products)
      .where(
        and(
          live,
          query.status ? eq(products.status, query.status) : undefined,
          query.cursor ? lt(products.id, query.cursor) : undefined,
          search
            ? or(
                ilike(products.name, search),
                exists(
                  this.db
                    .select({ id: productVariants.id })
                    .from(productVariants)
                    .where(
                      and(
                        eq(productVariants.productId, products.id),
                        liveVariant,
                        ilike(productVariants.sku, search),
                      ),
                    ),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(products.id))
      .limit(query.limit + 1);
    const page = toPage(rows, query.limit);
    return { ...page, items: await this.withVariants(page.items) };
  }

  async get(id: string): Promise<ProductWithVariants> {
    const [row] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.id, id), live));
    if (!row) throw new NotFoundException('Product not found');
    const [product] = await this.withVariants([row]);
    return product;
  }

  async create(input: NewProduct): Promise<ProductWithVariants> {
    await this.assertSlugFree(input.slug);
    await this.assertSkuFree(input.sku);
    const product = await this.db
      .transaction(async (tx) => {
        const [row] = await tx
          .insert(products)
          .values({
            name: input.name,
            slug: input.slug,
            description: input.description,
            status: input.status,
            publicMetadata: input.publicMetadata,
            privateMetadata: input.privateMetadata,
          })
          .returning();
        await tx
          .insert(productVariants)
          .values({ productId: row.id, sku: input.sku, isMaster: true });
        return row;
      })
      .catch(conflictOnDuplicate);
    this.logger.log(`Product ${product.id} created`);
    return this.get(product.id);
  }

  async update(
    id: string,
    changes: ProductChanges,
  ): Promise<ProductWithVariants> {
    await this.get(id);
    if (changes.slug) await this.assertSlugFree(changes.slug, id);
    await this.db
      .update(products)
      .set(changes)
      .where(eq(products.id, id))
      .catch(conflictOnDuplicate);
    this.logger.log(
      `Product ${id} changed: ${Object.keys(changes).join(', ')}`,
    );
    return this.get(id);
  }

  /** Soft-deletes the product and its variants; history keeps the rows. */
  async remove(id: string): Promise<void> {
    await this.get(id);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(productVariants)
        .set({ deletedAt: now })
        .where(and(eq(productVariants.productId, id), liveVariant));
      await tx
        .update(products)
        .set({ deletedAt: now })
        .where(eq(products.id, id));
    });
    this.logger.log(`Product ${id} deleted`);
  }

  async addVariant(
    productId: string,
    input: VariantInput & { sku: string },
  ): Promise<ProductVariant> {
    await this.get(productId);
    await this.assertSkuFree(input.sku);
    const [variant] = await this.db
      .insert(productVariants)
      .values({ ...input, productId, isMaster: false })
      .returning()
      .catch(conflictOnDuplicate);
    return variant;
  }

  async updateVariant(
    productId: string,
    variantId: string,
    changes: VariantInput,
  ): Promise<ProductVariant> {
    await this.getVariant(productId, variantId);
    if (changes.sku) await this.assertSkuFree(changes.sku, variantId);
    const [variant] = await this.db
      .update(productVariants)
      .set(changes)
      .where(eq(productVariants.id, variantId))
      .returning()
      .catch(conflictOnDuplicate);
    return variant;
  }

  /** The master goes only together with its product. */
  async removeVariant(productId: string, variantId: string): Promise<void> {
    const variant = await this.getVariant(productId, variantId);
    if (variant.isMaster) {
      throw new BadRequestException(
        'The master variant is deleted only together with its product',
      );
    }
    await this.db
      .update(productVariants)
      .set({ deletedAt: new Date() })
      .where(eq(productVariants.id, variantId));
  }

  private async getVariant(
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const product = await this.get(productId);
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  private async assertSlugFree(slug: string, exceptId?: string): Promise<void> {
    const [taken] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.slug, slug),
          live,
          exceptId ? ne(products.id, exceptId) : undefined,
        ),
      );
    if (taken) throw new ConflictException('This slug is already used');
  }

  private async assertSkuFree(sku: string, exceptId?: string): Promise<void> {
    const [taken] = await this.db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.sku, sku),
          liveVariant,
          exceptId ? ne(productVariants.id, exceptId) : undefined,
        ),
      );
    if (taken) throw new ConflictException(`SKU ${sku} is already used`);
  }

  private async withVariants(rows: Product[]): Promise<ProductWithVariants[]> {
    if (!rows.length) return [];
    const variants = await this.db
      .select()
      .from(productVariants)
      .where(
        and(
          inArray(
            productVariants.productId,
            rows.map((r) => r.id),
          ),
          liveVariant,
        ),
      )
      .orderBy(
        desc(productVariants.isMaster),
        asc(productVariants.position),
        asc(productVariants.id),
      );
    return rows.map((row) => ({
      ...row,
      variants: variants.filter((v) => v.productId === row.id),
    }));
  }
}
