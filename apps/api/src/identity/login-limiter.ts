import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 20;

/** Emails are hashed in key names: no personal data in Redis keys. */
const emailKey = (email: string) =>
  `login-fail:email:${createHash('sha256').update(email).digest('hex')}`;
const ipKey = (ip: string) => `login-fail:ip:${ip}`;

/**
 * Slows down password guessing: after too many failed logins for an email,
 * or from an IP, within the window, further attempts get 429 until the
 * window (started by the first failure) passes.
 */
@Injectable()
export class LoginLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async assertAllowed(email: string, ip: string): Promise<void> {
    const [byEmail, byIp] = await this.redis.mget(emailKey(email), ipKey(ip));
    const blocked =
      Number(byEmail ?? 0) >= MAX_FAILURES_PER_EMAIL ||
      Number(byIp ?? 0) >= MAX_FAILURES_PER_IP;
    if (blocked) {
      throw new HttpException(
        'Too many failed login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    await this.redis
      .multi()
      .incr(emailKey(email))
      .expire(emailKey(email), LOGIN_WINDOW_SECONDS, 'NX')
      .incr(ipKey(ip))
      .expire(ipKey(ip), LOGIN_WINDOW_SECONDS, 'NX')
      .exec();
  }

  /** After a successful login the email's counter starts over. */
  async reset(email: string): Promise<void> {
    await this.redis.del(emailKey(email));
  }
}
