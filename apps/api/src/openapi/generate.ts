import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { runOrExit } from '../bootstrap.js';
import { buildOpenApiDocument } from './openapi.js';
import { serializeOpenApi } from './serialize.js';

/** Path of the committed document, relative to apps/api (the script's cwd). */
export const OPENAPI_FILE = 'openapi.json';

/**
 * Writes openapi.json (part of `pnpm api:generate`). Preview mode builds the
 * module graph without instantiating providers, so no database, Redis or
 * other service has to be running.
 */
await runOrExit(async () => {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    abortOnError: false,
    logger: ['warn', 'fatal'],
  });
  await writeFile(OPENAPI_FILE, serializeOpenApi(buildOpenApiDocument(app)));
  await app.close();
  console.log(`Wrote apps/api/${OPENAPI_FILE}`);
});
