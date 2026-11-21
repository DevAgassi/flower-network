import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const locationKind = pgEnum('location_kind', ['store', 'warehouse']);
export const locationStatus = pgEnum('location_status', ['active', 'archived']);

/**
 * Every physical place of the network: stores (sell, hand out pickups) and
 * central warehouses. Never deleted — history references them — only
 * archived. Ids are UUIDv7 (database doc).
 */
export const locations = pgTable(
  'locations',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: varchar('name', { length: 200 }).notNull(),
    kind: locationKind('kind').notNull(),
    status: locationStatus('status').notNull().default('active'),
    address: varchar('address', { length: 500 }).notNull(),
    /** WGS 84 degrees; required for stores (map, delivery radius). */
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    phone: varchar('phone', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('locations_name_unique').on(sql`lower(${t.name})`),
    check('locations_latitude_range', sql`${t.latitude} between -90 and 90`),
    check(
      'locations_longitude_range',
      sql`${t.longitude} between -180 and 180`,
    ),
    check(
      'locations_coordinates_pair',
      sql`(${t.latitude} is null) = (${t.longitude} is null)`,
    ),
    check(
      'locations_store_coordinates',
      sql`${t.kind} <> 'store' or ${t.latitude} is not null`,
    ),
  ],
);

/**
 * Weekly opening hours, Europe/Kyiv local time: one interval per ISO weekday
 * (1 = Monday). No row = day off; `00:00–24:00` = around the clock.
 */
export const locationHours = pgTable(
  'location_hours',
  {
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday').notNull(),
    opensAt: time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.locationId, t.weekday] }),
    check('location_hours_weekday', sql`${t.weekday} between 1 and 7`),
    check('location_hours_interval', sql`${t.opensAt} < ${t.closesAt}`),
  ],
);

export type Location = typeof locations.$inferSelect;
export type LocationKind = (typeof locationKind.enumValues)[number];
export type LocationStatus = (typeof locationStatus.enumValues)[number];
