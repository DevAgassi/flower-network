// Uses the real PostgreSQL and Redis: run `pnpm infra:up` and `pnpm db:migrate`.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inArray, like } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { products, productVariants } from '../src/catalog/catalog.schema.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { type StaffRole, users } from '../src/identity/identity.schema.js';
import { SessionStore } from '../src/identity/session.store.js';
import { UsersService } from '../src/identity/users.service.js';

/** Every slug and SKU made here starts with the run's tag: easy cleanup. */
const TAG = `e2e${randomUUID().slice(0, 8)}`;

interface Product {
  id: string;
  slug: string;
  variants: { id: string; sku: string; isMaster: boolean }[];
  sellableVariantIds: string[];
}

describe('Catalog: products and variants (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  const userIds: string[] = [];
  const tokens = {} as Record<StaffRole, string>;
  let counter = 0;

  const unique = () => `${TAG}-${++counter}`;
  const as = (role: StaffRole) => {
    const auth = (r: request.Test) =>
      r.set('Authorization', `Bearer ${tokens[role]}`);
    const server = () => request(app.getHttpServer());
    return {
      get: (url: string) => auth(server().get(url)),
      post: (url: string, body: object) => auth(server().post(url)).send(body),
      patch: (url: string, body: object) =>
        auth(server().patch(url)).send(body),
      delete: (url: string) => auth(server().delete(url)),
    };
  };
  const newProduct = async (extra: object = {}): Promise<Product> => {
    const id = unique();
    const { body } = await as('admin')
      .post('/products', {
        name: `Rose ${id}`,
        slug: id,
        sku: id.toUpperCase(),
        ...extra,
      })
      .expect(201);
    return body as Product;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(DATABASE);

    for (const role of ['admin', 'florist'] as const) {
      const user = await app.get(UsersService).create({
        email: `e2e-cat-${role}-${randomUUID()}@example.com`,
        name: `E2E ${role}`,
        password: randomUUID(),
        role,
      });
      userIds.push(user.id);
      tokens[role] = (await app.get(SessionStore).create(user.id)).token;
    }
  });

  afterAll(async () => {
    for (const id of userIds) await app.get(SessionStore).revokeAll(id);
    await db.delete(users).where(inArray(users.id, userIds));
    const ours = await db
      .select({ id: products.id })
      .from(products)
      .where(like(products.slug, `${TAG}%`));
    if (ours.length) {
      const ids = ours.map((p) => p.id);
      await db
        .delete(productVariants)
        .where(inArray(productVariants.productId, ids));
      await db.delete(products).where(inArray(products.id, ids));
    }
    await app.close();
  });

  it('creates a product with its master variant, which is sold while alone', async () => {
    const product = await newProduct({
      status: 'active',
      publicMetadata: { color: 'red' },
    });

    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]).toMatchObject({ isMaster: true });
    expect(product.sellableVariantIds).toEqual([product.variants[0].id]);
  });

  it('sells only option variants once a product has them', async () => {
    const product = await newProduct();
    const { body: v50 } = await as('admin')
      .post(`/products/${product.id}/variants`, {
        sku: `${unique()}-50`,
        position: 1,
      })
      .expect(201);
    const { body: v60 } = await as('admin')
      .post(`/products/${product.id}/variants`, {
        sku: `${unique()}-60`,
        position: 2,
      })
      .expect(201);

    const { body } = await as('florist')
      .get(`/products/${product.id}`)
      .expect(200);
    const read = body as Product;
    expect(read.variants.map((v) => v.isMaster)).toEqual([true, false, false]);
    expect(read.sellableVariantIds).toEqual([
      (v50 as { id: string }).id,
      (v60 as { id: string }).id,
    ]);
  });

  it('lets the database hold only one master per product', async () => {
    const product = await newProduct();

    await expect(
      db.insert(productVariants).values({
        productId: product.id,
        sku: unique().toUpperCase(),
        isMaster: true,
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('stores SKUs uppercase and rejects duplicates until the owner is deleted', async () => {
    const id = unique();
    const first = await newProduct({ slug: id, sku: id.toLowerCase() });
    expect(first.variants[0].sku).toBe(id.toUpperCase());

    await as('admin')
      .post('/products', { name: 'Again', slug: unique(), sku: id })
      .expect(409);
    await as('admin')
      .post('/products', { name: 'Again', slug: id, sku: unique() })
      .expect(409);

    await as('admin').delete(`/products/${first.id}`).expect(204);
    await newProduct({ slug: id, sku: id });
  });

  it('soft-deletes a product with its variants and protects the master', async () => {
    const product = await newProduct();
    const master = product.variants[0].id;

    await as('admin')
      .delete(`/products/${product.id}/variants/${master}`)
      .expect(400);
    await as('admin').delete(`/products/${product.id}`).expect(204);

    await as('admin').get(`/products/${product.id}`).expect(404);
    const rows = await db
      .select()
      .from(productVariants)
      .where(inArray(productVariants.productId, [product.id]));
    expect(rows).toHaveLength(1);
    expect(rows[0].deletedAt).toBeInstanceOf(Date);
  });

  it('walks every product page by page without duplicates or gaps', async () => {
    const created = [];
    for (let i = 0; i < 5; i++) created.push((await newProduct()).id);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = `/products?limit=2&q=${TAG}${cursor ? `&cursor=${cursor}` : ''}`;
      const { body } = await as('florist').get(query).expect(200);
      const page = body as {
        items: { id: string }[];
        nextCursor: string | null;
      };
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(created));
    expect(seen).toEqual([...seen].sort().reverse()); // newest first
  });

  it('finds products by SKU and filters by status', async () => {
    const draft = await newProduct();
    const { body } = await as('florist')
      .get(`/products?q=${draft.variants[0].sku.toLowerCase()}&status=draft`)
      .expect(200);

    expect(
      (body as { items: { id: string }[] }).items.map((p) => p.id),
    ).toEqual([draft.id]);
  });

  it('lets a florist read the catalog but not change it', async () => {
    const product = await newProduct();

    await as('florist').get(`/products/${product.id}`).expect(200);
    await as('florist')
      .post('/products', { name: 'No', slug: unique(), sku: unique() })
      .expect(403);
    await as('florist')
      .patch(`/products/${product.id}`, { name: 'No' })
      .expect(403);
    await as('florist').delete(`/products/${product.id}`).expect(403);
  });
});
