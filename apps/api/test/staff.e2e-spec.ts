// Uses the real PostgreSQL and Redis: run `pnpm infra:up` and `pnpm db:migrate`.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { type StaffRole, users } from '../src/identity/identity.schema.js';
import { SessionStore } from '../src/identity/session.store.js';
import { locations } from '../src/locations/locations.schema.js';
import { LocationsService } from '../src/locations/locations.service.js';
import { UsersService } from '../src/identity/users.service.js';

describe('Roles, permissions and staff management (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let usersService: UsersService;
  let sessions: SessionStore;
  const createdIds: string[] = [];
  let SHOP_A: string;
  let SHOP_B: string;
  let ARCHIVED: string;

  /** A user with a live session; no login, so no limiter or scrypt per call. */
  async function staff(
    role: StaffRole,
    locationIds: string[] = [],
  ): Promise<{ id: string; email: string; token: string }> {
    const email = `e2e-${role}-${randomUUID()}@example.com`;
    const user = await usersService.create({
      email,
      name: `E2E ${role}`,
      password: randomUUID(),
      role,
      locationIds,
    });
    createdIds.push(user.id);
    const { token } = await sessions.create(user.id);
    return { id: user.id, email, token };
  }

  const as = (token: string) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`),
    post: (url: string, body?: object) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    patch: (url: string, body: object) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(DATABASE);
    usersService = app.get(UsersService);
    sessions = app.get(SessionStore);

    const directory = app.get(LocationsService);
    const shop = (suffix: string) =>
      directory.create({
        name: `E2E staff ${suffix} ${randomUUID()}`,
        kind: 'store',
        address: 'Test street 1',
        latitude: 50.45,
        longitude: 30.52,
        hours: [],
      });
    [SHOP_A, SHOP_B, ARCHIVED] = (
      await Promise.all([shop('A'), shop('B'), shop('archived')])
    ).map((l) => l.id);
    await directory.update(ARCHIVED, { status: 'archived' });
  });

  afterAll(async () => {
    for (const id of createdIds) await sessions.revokeAll(id);
    if (createdIds.length)
      await db.delete(users).where(inArray(users.id, createdIds));
    await db
      .delete(locations)
      .where(inArray(locations.id, [SHOP_A, SHOP_B, ARCHIVED]));
    await app.close();
  });

  it('lets the owner list staff and answers 403 to a florist', async () => {
    const owner = await staff('owner');
    const florist = await staff('florist', [SHOP_A]);

    const { body } = await as(owner.token).get('/staff').expect(200);
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: florist.id,
          role: 'florist',
          status: 'active',
          locationIds: [SHOP_A],
        }),
      ]),
    );

    const denied = await as(florist.token).get('/staff').expect(403);
    expect(denied.body).toMatchObject({
      statusCode: 403,
      message: 'Requires the staff:read permission',
    });
  });

  it('returns role, permissions and locations from /auth/me', async () => {
    const admin = await staff('admin');
    const courier = await staff('courier', [SHOP_B, SHOP_A]);

    await as(admin.token)
      .get('/auth/me')
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          role: 'admin',
          permissions: [
            'staff:read',
            'staff:manage',
            'locations:manage',
            'catalog:manage',
          ],
          locations: 'all',
        }),
      );
    await as(courier.token)
      .get('/auth/me')
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          role: 'courier',
          permissions: [],
          locations: [SHOP_A, SHOP_B].sort(),
        }),
      );
  });

  it('lets an admin create a florist who can then sign in', async () => {
    const admin = await staff('admin');
    const email = `e2e-new-${randomUUID()}@example.com`;

    const { body } = await as(admin.token)
      .post('/staff', {
        email,
        name: 'New Florist',
        role: 'florist',
        locationIds: [SHOP_A, SHOP_A],
      })
      .expect(201);
    const created = body as {
      member: { id: string; locationIds: string[] };
      password: string;
    };
    createdIds.push(created.member.id);
    expect(created.member.locationIds).toEqual([SHOP_A]);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: created.password })
      .expect(201);
    await as(admin.token)
      .post('/staff', { email, name: 'Again', role: 'courier' })
      .expect(409);
  });

  it('forbids an admin to create or change admins and owners', async () => {
    const admin = await staff('admin');
    const otherAdmin = await staff('admin');
    const owner = await staff('owner');

    await as(admin.token)
      .post('/staff', {
        email: `e2e-${randomUUID()}@example.com`,
        name: 'Promoted',
        role: 'admin',
      })
      .expect(403);
    await as(admin.token)
      .patch(`/staff/${otherAdmin.id}`, { name: 'Renamed' })
      .expect(403);
    await as(admin.token)
      .patch(`/staff/${owner.id}`, { status: 'disabled' })
      .expect(403);
    await as(admin.token)
      .patch(`/staff/${admin.id}`, { role: 'florist' })
      .expect(403);
  });

  it('applies a role change on the very next request', async () => {
    const owner = await staff('owner');
    const admin = await staff('admin');
    await as(admin.token).get('/staff').expect(200);

    await as(owner.token)
      .patch(`/staff/${admin.id}`, { role: 'florist', locationIds: [SHOP_B] })
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ role: 'florist', locationIds: [SHOP_B] }),
      );

    await as(admin.token).get('/staff').expect(403);
  });

  it('drops location bindings when a florist becomes an admin', async () => {
    const owner = await staff('owner');
    const florist = await staff('florist', [SHOP_A]);

    await as(owner.token)
      .patch(`/staff/${florist.id}`, { role: 'admin' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ locationIds: [] }));
    await as(owner.token)
      .patch(`/staff/${florist.id}`, { locationIds: [SHOP_A] })
      .expect(400);
  });

  it('ends all sessions when a user is disabled or their password reset', async () => {
    const admin = await staff('admin');
    const florist = await staff('florist');
    const courier = await staff('courier');

    await as(admin.token)
      .patch(`/staff/${florist.id}`, { status: 'disabled' })
      .expect(200);
    await as(florist.token).get('/auth/me').expect(401);

    const { body } = await as(admin.token)
      .post(`/staff/${courier.id}/password`)
      .expect(200);
    await as(courier.token).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: courier.email,
        password: (body as { password: string }).password,
      })
      .expect(201);
  });

  it('binds staff only to existing, active locations', async () => {
    const admin = await staff('admin');
    const florist = await staff('florist');

    for (const locationIds of [[randomUUID()], [ARCHIVED]]) {
      await as(admin.token)
        .patch(`/staff/${florist.id}`, { locationIds })
        .expect(400);
    }
    await expect(
      usersService.update(florist.id, { locationIds: [randomUUID()] }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('validates ids and bodies', async () => {
    const owner = await staff('owner');

    await as(owner.token).get('/staff/not-a-uuid').expect(400);
    await as(owner.token).get(`/staff/${randomUUID()}`).expect(404);
    await as(owner.token).patch(`/staff/${owner.id}`, {}).expect(400);
  });

  it('keeps one active owner when two owners demote each other at once', async (ctx) => {
    // Needs to be alone with its owners: true in CI, not on a dev database
    // that already has a real owner.
    const others = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, 'owner'),
          eq(users.status, 'active'),
          createdIds.length ? notInArray(users.id, createdIds) : undefined,
        ),
      );
    // Owners made by earlier tests in this file are demoted first.
    await db
      .update(users)
      .set({ role: 'florist' })
      .where(and(eq(users.role, 'owner'), inArray(users.id, createdIds)));
    if (others.length) ctx.skip();

    const a = await staff('owner');
    const b = await staff('owner');
    const results = await Promise.allSettled([
      usersService.update(a.id, { role: 'admin' }),
      usersService.update(b.id, { role: 'admin' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ status: 409 });
  });
});
