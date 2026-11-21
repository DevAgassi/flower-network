import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../database/database.module.js';
import type { OpeningHours } from './locations.contract.js';
import {
  type Location,
  type LocationKind,
  type LocationStatus,
  locationHours,
  locations,
} from './locations.schema.js';

/** A location with its weekly hours (`HH:MM`, Europe/Kyiv). */
export type LocationWithHours = Location & { hours: OpeningHours[] };

export interface NewLocation {
  name: string;
  kind: LocationKind;
  address: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  hours: OpeningHours[];
}

export interface LocationChanges {
  name?: string;
  kind?: LocationKind;
  status?: LocationStatus;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  /** Replaces the whole week. */
  hours?: OpeningHours[];
}

/**
 * The directory of stores and warehouses. The only code that reads or writes
 * `locations` and `location_hours`; other modules call this service.
 */
@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(options: {
    includeArchived: boolean;
  }): Promise<LocationWithHours[]> {
    const rows = await this.db
      .select()
      .from(locations)
      .where(
        options.includeArchived ? undefined : eq(locations.status, 'active'),
      )
      .orderBy(asc(locations.kind), asc(locations.name));
    return this.withHours(rows);
  }

  async get(id: string): Promise<LocationWithHours> {
    const [row] = await this.db
      .select()
      .from(locations)
      .where(eq(locations.id, id));
    if (!row) throw new NotFoundException('Location not found');
    const [location] = await this.withHours([row]);
    return location;
  }

  async create(input: NewLocation): Promise<LocationWithHours> {
    assertCoordinates(input.kind, input.latitude, input.longitude);
    await this.assertNameFree(input.name);
    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(locations)
        .values({
          name: input.name,
          kind: input.kind,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          phone: input.phone,
        })
        .returning();
      await insertHours(tx, row.id, input.hours);
      return row;
    });
    this.logger.log(`Location ${created.id} (${created.kind}) created`);
    return this.get(created.id);
  }

  async update(
    id: string,
    changes: LocationChanges,
  ): Promise<LocationWithHours> {
    const current = await this.get(id);
    assertCoordinates(
      changes.kind ?? current.kind,
      changes.latitude === undefined ? current.latitude : changes.latitude,
      changes.longitude === undefined ? current.longitude : changes.longitude,
    );
    if (changes.name) await this.assertNameFree(changes.name, id);

    const { hours, ...fields } = changes;
    await this.db.transaction(async (tx) => {
      if (Object.keys(fields).length) {
        await tx.update(locations).set(fields).where(eq(locations.id, id));
      }
      if (hours) {
        await tx.delete(locationHours).where(eq(locationHours.locationId, id));
        await insertHours(tx, id, hours);
      }
    });
    this.logger.log(
      `Location ${id} changed: ${Object.keys(changes).join(', ')}`,
    );
    return this.get(id);
  }

  /**
   * For other modules binding something to locations (staff, stock): every
   * id must be an existing, active location, otherwise `400`.
   */
  async assertActive(ids: readonly string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const rows = await this.db
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(inArray(locations.id, unique), eq(locations.status, 'active')),
      );
    const found = new Set(rows.map((r) => r.id));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `Unknown or archived locations: ${missing.join(', ')}`,
      );
    }
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const [taken] = await this.db
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(sql`lower(${locations.name})`, name.toLowerCase()),
          exceptId ? ne(locations.id, exceptId) : undefined,
        ),
      );
    if (taken) {
      throw new ConflictException('A location with this name already exists');
    }
  }

  private async withHours(rows: Location[]): Promise<LocationWithHours[]> {
    if (!rows.length) return [];
    const hours = await this.db
      .select()
      .from(locationHours)
      .where(
        inArray(
          locationHours.locationId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(locationHours.weekday));
    return rows.map((row) => ({
      ...row,
      hours: hours
        .filter((h) => h.locationId === row.id)
        .map((h) => ({
          weekday: h.weekday,
          opens: h.opensAt.slice(0, 5),
          closes: h.closesAt.slice(0, 5),
        })),
    }));
  }
}

async function insertHours(
  tx: Transaction,
  locationId: string,
  hours: OpeningHours[],
): Promise<void> {
  if (!hours.length) return;
  await tx.insert(locationHours).values(
    hours.map((h) => ({
      locationId,
      weekday: h.weekday,
      opensAt: h.opens,
      closesAt: h.closes,
    })),
  );
}

/** Coordinates come in pairs; a store must have them (map, delivery radius). */
function assertCoordinates(
  kind: LocationKind,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): void {
  const hasLat = latitude !== null && latitude !== undefined;
  const hasLng = longitude !== null && longitude !== undefined;
  if (hasLat !== hasLng) {
    throw new BadRequestException(
      'latitude and longitude must be given together',
    );
  }
  if (kind === 'store' && !hasLat) {
    throw new BadRequestException('A store needs latitude and longitude');
  }
}
