import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  type StaffRole,
  staffLocations,
  type User,
  type UserStatus,
  users,
} from './identity.schema.js';
import { hashPassword } from './password.js';
import { isLocationScoped } from './permissions.js';
import { SessionStore } from './session.store.js';

/** Emails are compared and stored in lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A user together with the locations they are bound to. */
export type StaffMember = User & { locationIds: string[] };

export interface NewStaffMember {
  email: string;
  name: string;
  password: string;
  role: StaffRole;
  /** Only for location-scoped roles (florist, courier). */
  locationIds?: readonly string[];
}

export interface StaffMemberChanges {
  name?: string;
  role?: StaffRole;
  status?: UserStatus;
  /** Replaces the current bindings. */
  locationIds?: readonly string[];
}

/**
 * Staff users and their location bindings. The only code that reads or
 * writes the `users` and `staff_locations` tables.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessions: SessionStore,
  ) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizeEmail(email)));
    return user;
  }

  async findMember(id: string): Promise<StaffMember | undefined> {
    const [[user], locations] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, id)),
      this.db
        .select({ locationId: staffLocations.locationId })
        .from(staffLocations)
        .where(eq(staffLocations.userId, id))
        .orderBy(asc(staffLocations.locationId)),
    ]);
    return user && { ...user, locationIds: locations.map((l) => l.locationId) };
  }

  async listMembers(): Promise<StaffMember[]> {
    const [rows, locations] = await Promise.all([
      this.db.select().from(users).orderBy(asc(users.name), asc(users.id)),
      this.db
        .select()
        .from(staffLocations)
        .orderBy(asc(staffLocations.locationId)),
    ]);
    const byUser = new Map<string, string[]>();
    for (const { userId, locationId } of locations) {
      byUser.set(userId, [...(byUser.get(userId) ?? []), locationId]);
    }
    return rows.map((user) => ({
      ...user,
      locationIds: byUser.get(user.id) ?? [],
    }));
  }

  async create(input: NewStaffMember): Promise<StaffMember> {
    const passwordHash = await hashPassword(input.password);
    const locationIds = unique(input.locationIds ?? []);
    const user = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email: normalizeEmail(input.email),
          name: input.name.trim(),
          role: input.role,
          passwordHash,
        })
        .returning();
      if (isLocationScoped(input.role) && locationIds.length) {
        await tx.insert(staffLocations).values(
          locationIds.map((locationId) => ({
            userId: created.id,
            locationId,
          })),
        );
      }
      return created;
    });
    return {
      ...user,
      locationIds: isLocationScoped(user.role) ? locationIds : [],
    };
  }

  /**
   * Applies the changes in one transaction. Keeps at least one active owner
   * (`409` otherwise); a role without location scope loses its bindings; a
   * disabled user loses all sessions.
   */
  async update(
    id: string,
    changes: StaffMemberChanges,
  ): Promise<StaffMember | undefined> {
    const updated = await this.db.transaction(async (tx) => {
      // All active owners are locked in id order before the target row, so
      // two owners demoting each other at once queue up (the second sees one
      // owner left and gets 409) instead of deadlocking.
      const lockActiveOwners = () =>
        tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'owner'), eq(users.status, 'active')))
          .orderBy(asc(users.id))
          .for('update');
      const [peek] = await tx
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, id));
      if (!peek) return undefined;
      let owners = peek.role === 'owner' ? await lockActiveOwners() : undefined;

      const [current] = await tx
        .select()
        .from(users)
        .where(eq(users.id, id))
        .for('update');
      if (!current) return undefined;

      const role = changes.role ?? current.role;
      const status = changes.status ?? current.status;
      const losesOwnership =
        current.role === 'owner' &&
        current.status === 'active' &&
        (role !== 'owner' || status !== 'active');
      if (losesOwnership) {
        owners ??= await lockActiveOwners();
        if (owners.length <= 1) {
          throw new ConflictException(
            'The network must keep at least one active owner',
          );
        }
      }

      await tx
        .update(users)
        .set({ name: changes.name?.trim(), role, status })
        .where(eq(users.id, id));

      if (!isLocationScoped(role)) {
        await tx.delete(staffLocations).where(eq(staffLocations.userId, id));
      } else if (changes.locationIds) {
        const locationIds = unique(changes.locationIds);
        await tx.delete(staffLocations).where(eq(staffLocations.userId, id));
        if (locationIds.length) {
          await tx
            .insert(staffLocations)
            .values(
              locationIds.map((locationId) => ({ userId: id, locationId })),
            );
        }
      }
      return current;
    });
    if (!updated) return undefined;
    if (changes.status === 'disabled') await this.sessions.revokeAll(id);
    return this.findMember(id);
  }

  /** A disabled user cannot sign in, and all their sessions end at once. */
  async setStatus(id: string, status: UserStatus): Promise<void> {
    await this.update(id, { status });
  }

  /** Sets a new password and ends every session of the user. */
  async setPassword(id: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, id));
    await this.sessions.revokeAll(id);
  }

  async recordLogin(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, id));
  }
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
