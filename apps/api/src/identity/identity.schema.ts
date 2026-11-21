import { sql } from 'drizzle-orm';
import {
  check,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const userStatus = pgEnum('user_status', ['active', 'disabled']);

/**
 * People who sign in: staff now (IAM-01); roles and shop bindings come with
 * IAM-02, customer accounts with IAM-03. Ids are UUIDv7 (database doc).
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

export type User = typeof users.$inferSelect;
export type UserStatus = (typeof userStatus.enumValues)[number];
