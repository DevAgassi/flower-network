import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';

/** Where the API serves its documentation outside production. */
export const DOCS_PATH = 'docs';

/**
 * `HealthController.check` → `Health_check`: stable, readable operation ids
 * for generated clients and the docs UI.
 */
export function operationId(controllerKey: string, methodKey: string): string {
  return `${controllerKey.replace(/Controller$/, '')}_${methodKey}`;
}

/**
 * The OpenAPI document of the API, built from controller metadata and the
 * zod schemas in `@Body({ schema })` / `@ApiResponse({ standardSchema })`.
 * Needs no running server or database: `pnpm api:generate` builds it from an
 * app created in preview mode.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Flower Network API')
    .setDescription(
      'HTTP API of the Flower Network platform. Generated from the NestJS controllers; do not edit openapi.json by hand.',
    )
    .setVersion('0.1.0')
    .build();
  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: operationId,
  });
}

/** Swagger UI at /docs and the JSON at /docs/openapi.json (not in production). */
export function setupApiDocs(app: INestApplication): void {
  SwaggerModule.setup(DOCS_PATH, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: `${DOCS_PATH}/openapi.json`,
  });
}
