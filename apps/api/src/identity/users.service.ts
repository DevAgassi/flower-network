import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { type User, type UserStatus, users } from './identity.schema.js';
import { hashPassword } from './password.js';
import { SessionStore } from './session.store.js';

/** Emails are compared and stored in lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Staff users. The only code that reads or writes the `users` table. */
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

  async findById(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async create(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values({
        email: normalizeEmail(input.email),
        name: input.name.trim(),
        passwordHash: await hashPassword(input.password),
      })
      .returning();
    return user;
  }

  /** A disabled user cannot sign in, and all their sessions end at once. */
  async setStatus(id: string, status: UserStatus): Promise<void> {
    await this.db.update(users).set({ status }).where(eq(users.id, id));
    if (status === 'disabled') await this.sessions.revokeAll(id);
  }

  async recordLogin(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, id));
  }
}
