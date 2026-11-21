import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const productStatus = pgEnum('product_status', ['draft', 'active']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  /** Soft delete (init.md §4.1): history keeps pointing at deleted rows. */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

const metadata = {
  publicMetadata: jsonb('public_metadata')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  privateMetadata: jsonb('private_metadata')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
};

/**
 * What a customer sees as one item ("Ecuador rose"). Carts, prices and stock
 * never use products directly — only their variants.
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: varchar('name', { length: 200 }).notNull(),
    /** URL name for the storefront; unique among not deleted products. */
    slug: varchar('slug', { length: 200 }).notNull(),
    description: text('description'),
    status: productStatus('status').notNull().default('draft'),
    ...metadata,
    ...timestamps,
  },
  (t) => [
    uniqueIndex('products_slug_unique')
      .on(t.slug)
      .where(sql`${t.deletedAt} is null`),
    check('products_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

/**
 * One concrete sellable form of a product with its own SKU ("Ecuador rose,
 * 60 cm"). Every product has exactly one master variant; it is sold when the
 * product has no other variants.
 */
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    /** Stored uppercase: staff type and scan it, case must not matter. */
    sku: varchar('sku', { length: 64 }).notNull(),
    isMaster: boolean('is_master').notNull().default(false),
    position: integer('position').notNull().default(0),
    ...metadata,
    ...timestamps,
  },
  (t) => [
    uniqueIndex('product_variants_sku_unique')
      .on(t.sku)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex('product_variants_one_master')
      .on(t.productId)
      .where(sql`${t.isMaster}`),
    index('product_variants_product_id_idx').on(t.productId),
    check(
      'product_variants_sku_format',
      sql`${t.sku} ~ '^[A-Z0-9][A-Z0-9._-]*$'`,
    ),
  ],
);

/** PostgreSQL `ltree` (extension enabled in migration 0000). */
const ltree = customType<{ data: string }>({ dataType: () => 'ltree' });

/**
 * An independent tree of categories: "Category", "Occasion". A product can be
 * in taxons of several taxonomies at once.
 */
export const taxonomies = pgTable(
  'taxonomies',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('taxonomies_slug_unique')
      .on(t.slug)
      .where(sql`${t.deletedAt} is null`),
    check(
      'taxonomies_slug_format',
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
  ],
);

/**
 * A node of a taxonomy. `path` is the materialized path of slugs from the
 * top (`flowers.roses.ecuador`): "everything under Flowers" is
 * `path <@ 'flowers'`, served by the GiST index, no recursion (init.md §4.2).
 */
export const taxons = pgTable(
  'taxons',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    taxonomyId: uuid('taxonomy_id')
      .notNull()
      .references(() => taxonomies.id),
    /** Null for a top-level taxon. */
    parentId: uuid('parent_id'),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    path: ltree('path').notNull(),
    /** Order among siblings. */
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }),
    // Unique path per taxonomy = unique slug among siblings.
    uniqueIndex('taxons_path_unique')
      .on(t.taxonomyId, t.path)
      .where(sql`${t.deletedAt} is null`),
    index('taxons_path_gist').using('gist', t.path),
    check('taxons_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

/** Which products are in which taxons, with their manual order there. */
export const productTaxons = pgTable(
  'product_taxons',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    taxonId: uuid('taxon_id')
      .notNull()
      .references(() => taxons.id),
    /** Manual order of products inside the taxon; new links go last. */
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.taxonId] }),
    index('product_taxons_taxon_id_idx').on(t.taxonId, t.position),
  ],
);

export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductStatus = (typeof productStatus.enumValues)[number];
export type Taxonomy = typeof taxonomies.$inferSelect;
export type Taxon = typeof taxons.$inferSelect;
