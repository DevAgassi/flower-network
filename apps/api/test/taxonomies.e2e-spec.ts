// Uses the real PostgreSQL and Redis: run `pnpm infra:up` and `pnpm db:migrate`.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inArray, like } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import {
  products,
  productTaxons,
  productVariants,
  taxonomies,
  taxons,
} from '../src/catalog/catalog.schema.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { type StaffRole, users } from '../src/identity/identity.schema.js';
import { SessionStore } from '../src/identity/session.store.js';
import { UsersService } from '../src/identity/users.service.js';

/** Every slug made here starts with the run's tag: easy cleanup. */
const TAG = `e2e${randomUUID().slice(0, 8)}`;

interface Taxon {
  id: string;
  parentId: string | null;
  slug: string;
  path: string;
  depth: number;
}

describe('Catalog: taxonomies and taxons (e2e)', () => {
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
      put: (url: string, body: object) => auth(server().put(url)).send(body),
      delete: (url: string) => auth(server().delete(url)),
    };
  };

  const newTaxonomy = async (): Promise<string> => {
    const slug = unique();
    const { body } = await as('admin')
      .post('/taxonomies', { name: `Taxonomy ${slug}`, slug })
      .expect(201);
    return (body as { id: string }).id;
  };
  const newTaxon = async (
    taxonomyId: string,
    slug: string,
    parentId?: string,
  ): Promise<Taxon> => {
    const { body } = await as('admin')
      .post(`/taxonomies/${taxonomyId}/taxons`, { name: slug, slug, parentId })
      .expect(201);
    return body as Taxon;
  };
  const newProduct = async (): Promise<string> => {
    const slug = unique();
    const { body } = await as('admin')
      .post('/products', { name: slug, slug, sku: slug.toUpperCase() })
      .expect(201);
    return (body as { id: string }).id;
  };
  const tree = async (taxonomyId: string): Promise<Taxon[]> =>
    (await as('florist').get(`/taxonomies/${taxonomyId}/taxons`).expect(200))
      .body as Taxon[];
  const productsIn = async (taxonId: string): Promise<string[]> =>
    (
      (await as('florist').get(`/products?taxonId=${taxonId}`).expect(200))
        .body as { items: { id: string }[] }
    ).items.map((p) => p.id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(DATABASE);

    for (const role of ['admin', 'florist'] as const) {
      const user = await app.get(UsersService).create({
        email: `e2e-tax-${role}-${randomUUID()}@example.com`,
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
    const ourProducts = (
      await db
        .select({ id: products.id })
        .from(products)
        .where(like(products.slug, `${TAG}%`))
    ).map((p) => p.id);
    const ourTaxonomies = (
      await db
        .select({ id: taxonomies.id })
        .from(taxonomies)
        .where(like(taxonomies.slug, `${TAG}%`))
    ).map((t) => t.id);
    if (ourProducts.length) {
      await db
        .delete(productTaxons)
        .where(inArray(productTaxons.productId, ourProducts));
      await db
        .delete(productVariants)
        .where(inArray(productVariants.productId, ourProducts));
      await db.delete(products).where(inArray(products.id, ourProducts));
    }
    if (ourTaxonomies.length) {
      // Children first: parent_id references taxons.
      const rows = await db
        .select({ id: taxons.id, path: taxons.path })
        .from(taxons)
        .where(inArray(taxons.taxonomyId, ourTaxonomies));
      rows.sort((a, b) => b.path.split('.').length - a.path.split('.').length);
      for (const row of rows) {
        await db.delete(taxons).where(inArray(taxons.id, [row.id]));
      }
      await db.delete(taxonomies).where(inArray(taxonomies.id, ourTaxonomies));
    }
    await app.close();
  });

  it('builds a tree with ltree paths and returns it depth-first', async () => {
    const category = await newTaxonomy();
    const flowers = await newTaxon(category, 'flowers');
    const roses = await newTaxon(category, 'roses', flowers.id);
    const ecuador = await newTaxon(category, 'ecuador', roses.id);

    expect(ecuador).toMatchObject({ path: 'flowers.roses.ecuador', depth: 3 });
    expect((await tree(category)).map((t) => t.path)).toEqual([
      'flowers',
      'flowers.roses',
      'flowers.roses.ecuador',
    ]);
  });

  it('puts a product into several taxonomies and finds it from any ancestor', async () => {
    const category = await newTaxonomy();
    const occasion = await newTaxonomy();
    const flowers = await newTaxon(category, 'flowers');
    const roses = await newTaxon(category, 'roses', flowers.id);
    const ecuador = await newTaxon(category, 'ecuador', roses.id);
    const birthday = await newTaxon(occasion, 'birthday');
    const product = await newProduct();
    const other = await newProduct();

    const { body } = await as('admin')
      .put(`/products/${product}/taxons`, {
        taxonIds: [ecuador.id, birthday.id],
      })
      .expect(200);
    expect((body as { taxonIds: string[] }).taxonIds.sort()).toEqual(
      [ecuador.id, birthday.id].sort(),
    );

    expect(await productsIn(flowers.id)).toEqual([product]);
    expect(await productsIn(birthday.id)).toEqual([product]);
    expect(await productsIn(roses.id)).not.toContain(other);

    await as('admin')
      .put(`/products/${product}/taxons`, { taxonIds: [randomUUID()] })
      .expect(400);
  });

  it('moves and renames a subtree, rewriting every path below', async () => {
    const category = await newTaxonomy();
    const flowers = await newTaxon(category, 'flowers');
    const bouquets = await newTaxon(category, 'bouquets');
    const roses = await newTaxon(category, 'roses', flowers.id);
    await newTaxon(category, 'ecuador', roses.id);

    await as('admin')
      .patch(`/taxons/${roses.id}`, { parentId: bouquets.id })
      .expect(200);
    await as('admin')
      .patch(`/taxons/${bouquets.id}`, { slug: 'bouquets-and-roses' })
      .expect(200);

    expect((await tree(category)).map((t) => t.path)).toEqual([
      'bouquets-and-roses',
      'bouquets-and-roses.roses',
      'bouquets-and-roses.roses.ecuador',
      'flowers',
    ]);
  });

  it('refuses to move a taxon into its own subtree or reuse a sibling slug', async () => {
    const category = await newTaxonomy();
    const flowers = await newTaxon(category, 'flowers');
    const roses = await newTaxon(category, 'roses', flowers.id);
    await newTaxon(category, 'tulips', flowers.id);

    await as('admin')
      .patch(`/taxons/${flowers.id}`, { parentId: roses.id })
      .expect(400);
    await as('admin')
      .patch(`/taxons/${flowers.id}`, { parentId: flowers.id })
      .expect(400);
    await as('admin')
      .patch(`/taxons/${roses.id}`, { slug: 'tulips' })
      .expect(409);
    await as('admin')
      .post(`/taxonomies/${category}/taxons`, {
        name: 'Roses again',
        slug: 'roses',
        parentId: flowers.id,
      })
      .expect(409);
  });

  it('deletes a subtree and unlinks its products', async () => {
    const category = await newTaxonomy();
    const flowers = await newTaxon(category, 'flowers');
    const roses = await newTaxon(category, 'roses', flowers.id);
    const product = await newProduct();
    await as('admin')
      .put(`/products/${product}/taxons`, { taxonIds: [roses.id] })
      .expect(200);

    await as('admin').delete(`/taxons/${flowers.id}`).expect(204);

    expect(await tree(category)).toEqual([]);
    const { body } = await as('admin').get(`/products/${product}`).expect(200);
    expect((body as { taxonIds: string[] }).taxonIds).toEqual([]);
    // the slug is free again
    await newTaxon(category, 'flowers');
  });

  it('lets a florist read taxonomies but not change them', async () => {
    const category = await newTaxonomy();

    await as('florist').get('/taxonomies').expect(200);
    await as('florist')
      .post('/taxonomies', { name: 'No', slug: unique() })
      .expect(403);
    await as('florist')
      .post(`/taxonomies/${category}/taxons`, { name: 'No', slug: 'no' })
      .expect(403);
  });
});
