import { sql } from 'drizzle-orm';
import {
  check,
  jsonb,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const userStatus = pgEnum('user_status', ['active', 'disabled']);

/** What a staff member does; decides their permissions (permissions.ts). */
export const staffRole = pgEnum('staff_role', [
  'owner',
  'admin',
  'florist',
  'courier',
]);

/**
 * Staff who sign in (IAM-01), each with one role (IAM-02). Customers are a
 * separate flow (IAM-03). Ids are UUIDv7 (database doc).
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** Stored lowercased: login is case-insensitive. */
    email: varchar('email', { length: 254 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    /** `scrypt$N$r$p$salt$hash`, see password.ts. Never the password itself. */
    passwordHash: text('password_hash').notNull(),
    role: staffRole('role').notNull(),
    status: userStatus('status').notNull().default('active'),
    publicMetadata: jsonb('public_metadata').notNull().default({}),
    privateMetadata: jsonb('private_metadata').notNull().default({}),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('users_email_lowercase', sql`${t.email} = lower(${t.email})`)],
);

/**
 * Locations a florist or courier works at. Owner and admin work everywhere
 * and have no rows here. `location_id` gets its foreign key to `locations`
 * in LOC-01, when that table exists.
 */
export const staffLocations = pgTable(
  'staff_locations',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.locationId] }),
    index('staff_locations_location_id_idx').on(t.locationId),
  ],
);

export type User = typeof users.$inferSelect;
export type UserStatus = (typeof userStatus.enumValues)[number];
export type StaffRole = (typeof staffRole.enumValues)[number];
