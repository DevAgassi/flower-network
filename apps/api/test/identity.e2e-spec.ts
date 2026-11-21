// Uses the real PostgreSQL and Redis: run `pnpm infra:up` and `pnpm db:migrate`.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { users } from '../src/identity/identity.schema.js';
import {
  SESSION_ABSOLUTE_TTL_SECONDS,
  SessionStore,
} from '../src/identity/session.store.js';
import { UsersService } from '../src/identity/users.service.js';
import { REDIS } from '../src/redis/redis.module.js';

const PASSWORD = 'Correct-Horse-7';

describe('Staff authentication (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let redis: Redis;
  let usersService: UsersService;
  const createdIds: string[] = [];

  /** A fresh user per test, so limits and sessions never leak between tests. */
  async function createUser(): Promise<{ id: string; email: string }> {
    const email = `e2e-${randomUUID()}@Example.com`;
    const user = await usersService.create({
      email,
      name: 'E2E Florist',
      password: PASSWORD,
      role: 'florist',
    });
    createdIds.push(user.id);
    return { id: user.id, email };
  }

  function login(email: string, password = PASSWORD) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(DATABASE);
    redis = app.get(REDIS);
    usersService = app.get(UsersService);
  });

  afterAll(async () => {
    for (const id of createdIds) await app.get(SessionStore).revokeAll(id);
    if (createdIds.length)
      await db.delete(users).where(inArray(users.id, createdIds));
    const limiterKeys = await redis.keys('login-fail:*');
    if (limiterKeys.length) await redis.del(...limiterKeys);
    await app.close();
  });

  it('rejects requests without a session, except public routes', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/metrics').expect(200);
  });

  it('signs in, identifies the user and signs out', async () => {
    const { id, email } = await createUser();

    const loginResponse = await login(email.toUpperCase()).expect(201);
    const { token, expiresAt, user } = loginResponse.body as {
      token: string;
      expiresAt: string;
      user: Record<string, unknown>;
    };
    expect(user).toEqual({
      id,
      email: email.toLowerCase(),
      name: 'E2E Florist',
      role: 'florist',
      permissions: [],
      locations: [],
    });
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, user);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const { email } = await createUser();

    const wrongPassword = await login(email, 'wrong').expect(401);
    const unknownEmail = await login(
      `nobody-${randomUUID()}@example.com`,
    ).expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('blocks the 6th failed attempt for an email within the window', async () => {
    const { email } = await createUser();
    for (let i = 0; i < 5; i++) await login(email, `wrong-${i}`).expect(401);

    await login(email, 'wrong-6').expect(429);
    await login(email).expect(429); // even the right password, until the window passes
  });

  it('ends every session of a disabled user', async () => {
    const { id, email } = await createUser();
    const first = (await login(email).expect(201)).body as { token: string };
    const second = (await login(email).expect(201)).body as { token: string };

    await usersService.setStatus(id, 'disabled');

    for (const { token } of [first, second]) {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    }
    await login(email).expect(401);
  });

  it('stores only hashes: no token in Redis, no password in the database', async () => {
    const { id, email } = await createUser();
    const { token } = (await login(email).expect(201)).body as {
      token: string;
    };

    const keys = await redis.keys('session:*');
    expect(keys.some((key) => key.includes(token))).toBe(false);
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(row.passwordHash).not.toContain(PASSWORD);
    expect(row.lastLoginAt).toBeInstanceOf(Date);
  });

  it('ends a session after its absolute lifetime even if it was active', async () => {
    const { id } = await createUser();
    const sessions = app.get(SessionStore);
    const { token } = await sessions.create(id);
    expect(await sessions.resolve(token)).toMatchObject({ userId: id });

    // Pretend the session started just over 7 days ago.
    const [hash] = await redis.smembers(`user-sessions:${id}`);
    await redis.hset(
      `session:${hash}`,
      'createdAt',
      String(Date.now() - (SESSION_ABSOLUTE_TTL_SECONDS + 60) * 1000),
    );

    expect(await sessions.resolve(token)).toBeNull();
    expect(await redis.exists(`session:${hash}`)).toBe(0);
  });
});
