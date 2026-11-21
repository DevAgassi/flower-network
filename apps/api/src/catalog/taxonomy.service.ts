import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../database/database.module.js';
import {
  productTaxons,
  type Taxon,
  type Taxonomy,
  taxonomies,
  taxons,
} from './catalog.schema.js';
import { CatalogService, type ProductWithVariants } from './catalog.service.js';

/** A taxon with its depth, as the API returns it. */
export type TaxonNode = Taxon & { depth: number };

/** `true` when `path` is `ancestor` or lies below it. */
export function isWithin(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}.`);
}

/**
 * Depth-first order (parent before children, siblings by position, then
 * name), the order a UI draws a tree in.
 */
export function depthFirst(rows: Taxon[]): TaxonNode[] {
  const children = new Map<string | null, Taxon[]>();
  for (const row of rows) {
    children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
  }
  const ordered: TaxonNode[] = [];
  const visit = (parentId: string | null, depth: number) => {
    const siblings = (children.get(parentId) ?? []).sort(
      (a, b) => a.position - b.position || a.name.localeCompare(b.name),
    );
    for (const taxon of siblings) {
      ordered.push({ ...taxon, depth });
      visit(taxon.id, depth + 1);
    }
  };
  visit(null, 1);
  return ordered;
}

function conflictOnDuplicate(message: string) {
  return (error: unknown): never => {
    const { code, cause } = error as {
      code?: string;
      cause?: { code?: string };
    };
    if ((cause?.code ?? code) === '23505') throw new ConflictException(message);
    throw error;
  };
}

const liveTaxonomy = isNull(taxonomies.deletedAt);
const liveTaxon = isNull(taxons.deletedAt);

/**
 * Taxonomies, taxons and the links of products to taxons. Paths are kept in
 * sync on every move or rename; deletes are soft and cover whole subtrees.
 */
@Injectable()
export class TaxonomyService {
  private readonly logger = new Logger(TaxonomyService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: CatalogService,
  ) {}

  listTaxonomies(): Promise<Taxonomy[]> {
    return this.db
      .select()
      .from(taxonomies)
      .where(liveTaxonomy)
      .orderBy(asc(taxonomies.position), asc(taxonomies.name));
  }

  async getTaxonomy(id: string): Promise<Taxonomy> {
    const [row] = await this.db
      .select()
      .from(taxonomies)
      .where(and(eq(taxonomies.id, id), liveTaxonomy));
    if (!row) throw new NotFoundException('Taxonomy not found');
    return row;
  }

  async createTaxonomy(input: {
    name: string;
    slug: string;
    position: number;
  }): Promise<Taxonomy> {
    const [row] = await this.db
      .insert(taxonomies)
      .values(input)
      .returning()
      .catch(conflictOnDuplicate('This taxonomy slug is already used'));
    this.logger.log(`Taxonomy ${row.id} created`);
    return row;
  }

  async updateTaxonomy(
    id: string,
    changes: { name?: string; slug?: string; position?: number },
  ): Promise<Taxonomy> {
    await this.getTaxonomy(id);
    const [row] = await this.db
      .update(taxonomies)
      .set(changes)
      .where(eq(taxonomies.id, id))
      .returning()
      .catch(conflictOnDuplicate('This taxonomy slug is already used'));
    return row;
  }

  /** Soft-deletes the taxonomy with all its taxons; unlinks their products. */
  async removeTaxonomy(id: string): Promise<void> {
    await this.getTaxonomy(id);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const ids = await this.softDeleteTaxons(
        tx,
        and(eq(taxons.taxonomyId, id), liveTaxon),
        now,
      );
      await this.unlink(tx, ids);
      await tx
        .update(taxonomies)
        .set({ deletedAt: now })
        .where(eq(taxonomies.id, id));
    });
    this.logger.log(`Taxonomy ${id} deleted`);
  }

  async tree(taxonomyId: string): Promise<TaxonNode[]> {
    await this.getTaxonomy(taxonomyId);
    const rows = await this.db
      .select()
      .from(taxons)
      .where(and(eq(taxons.taxonomyId, taxonomyId), liveTaxon));
    return depthFirst(rows);
  }

  async getTaxon(id: string): Promise<TaxonNode> {
    const [row] = await this.db
      .select()
      .from(taxons)
      .where(and(eq(taxons.id, id), liveTaxon));
    if (!row) throw new NotFoundException('Taxon not found');
    return { ...row, depth: row.path.split('.').length };
  }

  async createTaxon(
    taxonomyId: string,
    input: { name: string; slug: string; parentId?: string; position: number },
  ): Promise<TaxonNode> {
    await this.getTaxonomy(taxonomyId);
    const parent = input.parentId
      ? await this.parentIn(taxonomyId, input.parentId)
      : undefined;
    const path = parent ? `${parent.path}.${input.slug}` : input.slug;
    const [row] = await this.db
      .insert(taxons)
      .values({ ...input, taxonomyId, parentId: parent?.id ?? null, path })
      .returning()
      .catch(conflictOnDuplicate('A sibling taxon already uses this slug'));
    return this.getTaxon(row.id);
  }

  /**
   * Renaming the slug or moving the taxon rewrites the paths of its whole
   * subtree in the same transaction.
   */
  async updateTaxon(
    id: string,
    changes: {
      name?: string;
      slug?: string;
      parentId?: string | null;
      position?: number;
    },
  ): Promise<TaxonNode> {
    const current = await this.getTaxon(id);
    const slug = changes.slug ?? current.slug;
    let parentPath = current.path.split('.').slice(0, -1).join('.');
    let parentId = current.parentId;
    if (changes.parentId !== undefined) {
      parentId = changes.parentId;
      parentPath = '';
      if (changes.parentId) {
        const parent = await this.parentIn(
          current.taxonomyId,
          changes.parentId,
        );
        if (isWithin(parent.path, current.path)) {
          throw new BadRequestException(
            'A taxon cannot be moved into itself or its own subtree',
          );
        }
        parentPath = parent.path;
      }
    }
    const path = parentPath ? `${parentPath}.${slug}` : slug;

    await this.db
      .transaction(async (tx) => {
        await tx
          .update(taxons)
          .set({
            name: changes.name,
            position: changes.position,
            slug,
            parentId,
          })
          .where(eq(taxons.id, id));
        if (path !== current.path) {
          // The node itself gets the new path; each descendant gets the new
          // prefix + its part below the old one. (subltree/subpath with an
          // empty remainder fails with "invalid positions", hence the CASE.)
          await tx
            .update(taxons)
            .set({
              path: sql`case when nlevel(${taxons.path}) = nlevel(${current.path}::ltree) then ${path}::ltree else ${path}::ltree || subpath(${taxons.path}, nlevel(${current.path}::ltree)) end`,
            })
            .where(
              and(
                eq(taxons.taxonomyId, current.taxonomyId),
                liveTaxon,
                sql`${taxons.path} <@ ${current.path}::ltree`,
              ),
            );
        }
      })
      .catch(conflictOnDuplicate('A sibling taxon already uses this slug'));
    if (path !== current.path) {
      this.logger.log(`Taxon ${id} moved: ${current.path} -> ${path}`);
    }
    return this.getTaxon(id);
  }

  /** Soft-deletes the taxon with its subtree; unlinks their products. */
  async removeTaxon(id: string): Promise<void> {
    const taxon = await this.getTaxon(id);
    await this.db.transaction(async (tx) => {
      const ids = await this.softDeleteTaxons(
        tx,
        and(
          eq(taxons.taxonomyId, taxon.taxonomyId),
          liveTaxon,
          sql`${taxons.path} <@ ${taxon.path}::ltree`,
        ),
        new Date(),
      );
      await this.unlink(tx, ids);
    });
    this.logger.log(`Taxon ${id} deleted with its subtree`);
  }

  /** Replaces the product's taxons; new links go last inside each taxon. */
  async setProductTaxons(
    productId: string,
    taxonIds: string[],
  ): Promise<ProductWithVariants> {
    await this.catalog.get(productId);
    const wanted = [...new Set(taxonIds)];
    if (wanted.length) {
      const found = await this.db
        .select({ id: taxons.id })
        .from(taxons)
        .where(and(inArray(taxons.id, wanted), liveTaxon));
      const missing = wanted.filter((t) => !found.some((f) => f.id === t));
      if (missing.length) {
        throw new BadRequestException(`Unknown taxons: ${missing.join(', ')}`);
      }
    }
    await this.db.transaction(async (tx) => {
      await tx
        .delete(productTaxons)
        .where(
          and(
            eq(productTaxons.productId, productId),
            wanted.length
              ? notInArray(productTaxons.taxonId, wanted)
              : undefined,
          ),
        );
      for (const taxonId of wanted) {
        await tx
          .insert(productTaxons)
          .values({
            productId,
            taxonId,
            position: sql`(select coalesce(max(${productTaxons.position}) + 1, 0) from ${productTaxons} where ${productTaxons.taxonId} = ${taxonId})`,
          })
          .onConflictDoNothing();
      }
    });
    return this.catalog.get(productId);
  }

  private async parentIn(taxonomyId: string, parentId: string): Promise<Taxon> {
    const [parent] = await this.db
      .select()
      .from(taxons)
      .where(
        and(
          eq(taxons.id, parentId),
          eq(taxons.taxonomyId, taxonomyId),
          liveTaxon,
        ),
      );
    if (!parent) {
      throw new BadRequestException('Parent taxon not found in this taxonomy');
    }
    return parent;
  }

  private async softDeleteTaxons(
    tx: Transaction,
    where: ReturnType<typeof and>,
    now: Date,
  ): Promise<string[]> {
    const rows = await tx
      .update(taxons)
      .set({ deletedAt: now })
      .where(where)
      .returning({ id: taxons.id });
    return rows.map((r) => r.id);
  }

  /** Links are not history: removed together with their taxons. */
  private async unlink(tx: Transaction, taxonIds: string[]): Promise<void> {
    if (!taxonIds.length) return;
    await tx
      .delete(productTaxons)
      .where(inArray(productTaxons.taxonId, taxonIds));
  }
}
