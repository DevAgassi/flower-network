import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../app.module.js';
import { runOrExit, STARTUP_LOG_LEVELS } from '../bootstrap.js';
import { AppConfigService } from '../config/app-config.module.js';
import { setupApiDocs } from '../openapi/openapi.js';

/** HTTP API. Also runs the outbox relay unless OUTBOX_RELAY=off. */
await runOrExit(async () => {
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    bufferLogs: true,
    logger: STARTUP_LOG_LEVELS,
  });
  // From here on every log line goes through pino (JSON in production).
  app.useLogger(app.get(Logger));
  // On SIGTERM the relay stops claiming, finishes in-flight publishes and
  // releases its leases before the database pool is closed.
  app.enableShutdownHooks();
  const config = app.get(AppConfigService);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupApiDocs(app);
  }
  await app.listen(config.get('PORT', { infer: true }));
});
