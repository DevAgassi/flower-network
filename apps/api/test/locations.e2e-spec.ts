// Uses the real PostgreSQL and Redis: run `pnpm infra:up` and `pnpm db:migrate`.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inArray, like } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { type StaffRole, users } from '../src/identity/identity.schema.js';
import { SessionStore } from '../src/identity/session.store.js';
import { UsersService } from '../src/identity/users.service.js';
import { locations } from '../src/locations/locations.schema.js';

const PREFIX = 'E2E location';

describe('Locations (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  const userIds: string[] = [];
  const tokens = {} as Record<StaffRole, string>;

  const name = (label: string) => `${PREFIX} ${label} ${randomUUID()}`;
  const store = (label: string) => ({
    name: name(label),
    kind: 'store',
    address: 'Khreshchatyk 1, Kyiv',
    latitude: 50.4501,
    longitude: 30.5234,
    phone: '+380 44 123 45 67',
  });
  const as = (role: StaffRole) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${tokens[role]}`),
    post: (url: string, body: object) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${tokens[role]}`)
        .send(body),
    patch: (url: string, body: object) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${tokens[role]}`)
        .send(body),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(DATABASE);

    for (const role of ['admin', 'florist'] as const) {
      const user = await app.get(UsersService).create({
        email: `e2e-loc-${role}-${randomUUID()}@example.com`,
        name: `E2E ${role}`,
        password: randomUUID(),
        role,
      });
      userIds.push(user.id);
      tokens[role] = (await app.get(SessionStore).create(user.id)).token;
    }
  });

  afterAll(async () => {
    for (const id of userIds) await app.get(SessionStore).revokeAll(id);
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(locations).where(like(locations.name, `${PREFIX}%`));
    await app.close();
  });

  it('lets an admin create a store with weekly hours; a florist reads but cannot create', async () => {
    const body = {
      ...store('Podil'),
      hours: [
        { weekday: 7, opens: '00:00', closes: '24:00' },
        { weekday: 1, opens: '08:30', closes: '21:00' },
      ],
    };

    const { body: created } = await as('admin')
      .post('/locations', body)
      .expect(201);
    expect(created).toMatchObject({
      name: body.name,
      kind: 'store',
      status: 'active',
      latitude: 50.4501,
      hours: [
        { weekday: 1, opens: '08:30', closes: '21:00' },
        { weekday: 7, opens: '00:00', closes: '24:00' },
      ],
    });

    await as('florist')
      .get(`/locations/${(created as { id: string }).id}`)
      .expect(200);
    await as('florist').post('/locations', store('Denied')).expect(403);
  });

  it('requires coordinates for a store, not for a warehouse', async () => {
    const {
      latitude: _lat,
      longitude: _lng,
      ...noCoordinates
    } = store('No coords');

    await as('admin').post('/locations', noCoordinates).expect(400);
    await as('admin')
      .post('/locations', { ...store('Half'), longitude: undefined })
      .expect(400);
    await as('admin')
      .post('/locations', { ...noCoordinates, kind: 'warehouse' })
      .expect(201);
  });

  it('rejects a duplicate name regardless of case', async () => {
    const first = store('Duplicate');
    await as('admin').post('/locations', first).expect(201);

    await as('admin')
      .post('/locations', { ...first, name: first.name.toUpperCase() })
      .expect(409);
  });

  it('archives instead of deleting and hides archived locations by default', async () => {
    const { body } = await as('admin')
      .post('/locations', store('Closing'))
      .expect(201);
    const id = (body as { id: string }).id;

    await as('admin')
      .patch(`/locations/${id}`, { status: 'archived' })
      .expect(200);

    const ids = async (query = '') =>
      (
        (await as('florist').get(`/locations${query}`).expect(200)).body as {
          id: string;
        }[]
      ).map((l) => l.id);
    expect(await ids()).not.toContain(id);
    expect(await ids('?includeArchived=true')).toContain(id);
    await request(app.getHttpServer())
      .delete(`/locations/${id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(404);
  });

  it('replaces the weekly hours and keeps a store with coordinates', async () => {
    const { body } = await as('admin')
      .post('/locations', {
        ...store('Hours'),
        hours: [{ weekday: 2, opens: '10:00', closes: '18:00' }],
      })
      .expect(201);
    const id = (body as { id: string }).id;

    await as('admin')
      .patch(`/locations/${id}`, {
        hours: [{ weekday: 5, opens: '09:00', closes: '22:00' }],
      })
      .expect(200)
      .expect(({ body: updated }) =>
        expect((updated as { hours: unknown }).hours).toEqual([
          { weekday: 5, opens: '09:00', closes: '22:00' },
        ]),
      );
    await as('admin')
      .patch(`/locations/${id}`, { latitude: null, longitude: null })
      .expect(400);
    await as('admin').get(`/locations/${randomUUID()}`).expect(404);
  });
});
