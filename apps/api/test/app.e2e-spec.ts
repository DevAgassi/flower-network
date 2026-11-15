import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// Uses the real database: run `pnpm infra:up` first.
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET /health', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'api',
      checks: { database: 'up', outbox: 'up' },
    });
  });

  it('returns the x-request-id it was given, or a generated one', async () => {
    const given = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'e2e-request-1');
    const generated = await request(app.getHttpServer()).get('/health');

    expect(given.headers['x-request-id']).toBe('e2e-request-1');
    expect(generated.headers['x-request-id']).toMatch(/^[\da-f-]{36}$/);
  });

  it('GET /metrics exposes runtime, HTTP and outbox metrics', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);

    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200)
      .expect('Content-Type', /text\/plain/);

    expect(response.text).toContain('process_cpu_user_seconds_total');
    expect(response.text).toMatch(
      /http_request_duration_seconds_count\{method="GET",route="\/health",status="200"\} \d+/,
    );
    expect(response.text).toContain('outbox_messages_pending');
  });

  afterEach(async () => {
    await app.close();
  });
});
