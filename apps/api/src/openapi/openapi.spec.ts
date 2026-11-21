import { readFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../app.module.js';
import { buildOpenApiDocument, operationId } from './openapi.js';
import { serializeOpenApi } from './serialize.js';

describe('operationId', () => {
  it('names operations Controller_method without the suffix', () => {
    expect(operationId('HealthController', 'check')).toBe('Health_check');
  });
});

describe('OpenAPI document', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    // Same as `pnpm api:generate`: no providers are instantiated.
    app = await NestFactory.create(AppModule, { preview: true, logger: false });
    document = buildOpenApiDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('matches the committed openapi.json (run `pnpm api:generate` if not)', async () => {
    const committed = await readFile('openapi.json', 'utf8');

    expect(serializeOpenApi(document)).toBe(committed);
  });

  it('describes GET /health with the HealthResponse schema for 200 and 503', () => {
    const responses = document.paths['/health']?.get?.responses ?? {};
    const ref = { $ref: '#/components/schemas/HealthResponse' };

    expect(responses['200']).toMatchObject({
      content: { 'application/json': { schema: ref } },
    });
    expect(responses['503']).toMatchObject({
      content: { 'application/json': { schema: ref } },
    });
    expect(document.components?.schemas?.HealthResponse).toMatchObject({
      required: ['status', 'service', 'timestamp', 'checks'],
    });
  });

  it('requires a bearer session on every operation except the public ones', () => {
    // Public routes (@Public()) must be listed here; anything else without a
    // security requirement means @ApiBearerAuth() was forgotten.
    const publicOperations = ['GET /health', 'POST /auth/login'];
    const unsecured = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([, op]) => !(op as { security?: unknown[] }).security?.length)
        .map(([method]) => `${method.toUpperCase()} ${path}`),
    );

    expect(unsecured.sort()).toEqual(publicOperations.sort());
  });

  it('leaves /metrics out of the contract', () => {
    expect(document.paths['/metrics']).toBeUndefined();
  });
});
