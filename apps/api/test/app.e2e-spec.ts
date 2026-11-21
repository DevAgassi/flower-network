import { Test, TestingModule } from '@nestjs/testing';
import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { z } from 'zod';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Public } from './../src/identity/auth.decorators.js';
import { setupApiDocs } from './../src/openapi/openapi.js';

const createThingSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
});

/** Test-only endpoint: shows how every zod-described body is validated. */
@Public()
@Controller('test-things')
class ThingsController {
  @Post()
  create(
    @Body({ schema: createThingSchema })
    body: z.infer<typeof createThingSchema>,
  ) {
    return body;
  }
}

// Uses the real database: run `pnpm infra:up` first.
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ThingsController],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApiDocs(app);
    await app.init();
  });

  it('GET /health', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'api',
      checks: { database: 'up', outbox: 'up', redis: 'up' },
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

  it('rejects a body that fails its zod schema with 400 listing every problem', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-things')
      .send({ name: '', quantity: 1.5 })
      .expect(400);

    const messages = (response.body as { message: string[] }).message;
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('name'),
        expect.stringContaining('quantity'),
      ]),
    );
  });

  it('passes a valid body to the handler', async () => {
    await request(app.getHttpServer())
      .post('/test-things')
      .send({ name: 'roses', quantity: 20 })
      .expect(201, { name: 'roses', quantity: 20 });
  });

  it('serves the OpenAPI document under /docs', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs/openapi.json')
      .expect(200);

    expect((response.body as { paths: object }).paths).toHaveProperty(
      '/health',
    );
  });

  afterEach(async () => {
    await app.close();
  });
});
