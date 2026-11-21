import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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

export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductStatus = (typeof productStatus.enumValues)[number];
