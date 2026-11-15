import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  RUNTIME_LOG_LEVELS,
  runOrExit,
  STARTUP_LOG_LEVELS,
} from './bootstrap.js';
import { AppConfigService } from './config/app-config.module.js';

/** HTTP API. Also runs the outbox relay unless OUTBOX_RELAY=off. */
await runOrExit(async () => {
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: STARTUP_LOG_LEVELS,
  });
  app.useLogger(RUNTIME_LOG_LEVELS);
  // On SIGTERM the relay stops claiming, finishes in-flight publishes and
  // releases its leases before the database pool is closed.
  app.enableShutdownHooks();
  const config = app.get(AppConfigService);
  await app.listen(config.get('PORT', { infer: true }));
});
