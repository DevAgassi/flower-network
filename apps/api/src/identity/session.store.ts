import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

/** A session ends after this long without requests (a florist's shift). */
export const SESSION_IDLE_TTL_SECONDS = 12 * 60 * 60;
/** A session ends this long after login, however active it is. */
export const SESSION_ABSOLUTE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface Session {
  userId: string;
  /** When the session ends if no further request arrives. */
  expiresAt: Date;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const sessionKey = (hash: string) => `session:${hash}`;
const userSessionsKey = (userId: string) => `user-sessions:${userId}`;

/**
 * Sessions in Redis. The client holds a random token; Redis keeps only its
 * SHA-256, so reading Redis does not give usable tokens.
 *
 * - `session:<hash>` → hash { userId, createdAt }, TTL = idle timeout,
 *   extended on every request but never past the absolute lifetime;
 * - `user-sessions:<userId>` → set of hashes, to end all sessions of a user.
 */
@Injectable()
export class SessionStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async create(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const hash = tokenHash(token);
    const now = Date.now();
    await this.redis
      .multi()
      .hset(sessionKey(hash), { userId, createdAt: String(now) })
      .expire(sessionKey(hash), SESSION_IDLE_TTL_SECONDS)
      .sadd(userSessionsKey(userId), hash)
      .expire(userSessionsKey(userId), SESSION_ABSOLUTE_TTL_SECONDS)
      .exec();
    return {
      token,
      expiresAt: new Date(now + SESSION_IDLE_TTL_SECONDS * 1000),
    };
  }

  /** The session of a token, its idle timeout extended; null when it ended. */
  async resolve(token: string): Promise<Session | null> {
    const hash = tokenHash(token);
    const data = await this.redis.hgetall(sessionKey(hash));
    if (!data.userId || !data.createdAt) return null;

    const now = Date.now();
    const absoluteEnd =
      Number(data.createdAt) + SESSION_ABSOLUTE_TTL_SECONDS * 1000;
    const remainingSeconds = Math.floor((absoluteEnd - now) / 1000);
    if (remainingSeconds <= 0) {
      await this.revokeHash(hash, data.userId);
      return null;
    }
    const ttl = Math.min(SESSION_IDLE_TTL_SECONDS, remainingSeconds);
    await this.redis.expire(sessionKey(hash), ttl);
    return { userId: data.userId, expiresAt: new Date(now + ttl * 1000) };
  }

  async revoke(token: string): Promise<void> {
    const hash = tokenHash(token);
    const userId = await this.redis.hget(sessionKey(hash), 'userId');
    await this.revokeHash(hash, userId);
  }

  /** Ends every session of a user (disabled account, password change). */
  async revokeAll(userId: string): Promise<void> {
    const hashes = await this.redis.smembers(userSessionsKey(userId));
    await this.redis.del(userSessionsKey(userId), ...hashes.map(sessionKey));
  }

  private async revokeHash(hash: string, userId: string | null): Promise<void> {
    const pipeline = this.redis.multi().del(sessionKey(hash));
    if (userId) pipeline.srem(userSessionsKey(userId), hash);
    await pipeline.exec();
  }
}
