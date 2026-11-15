import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  RUNTIME_LOG_LEVELS,
  runOrExit,
  STARTUP_LOG_LEVELS,
} from './bootstrap.js';
import { AppConfigService } from './config/app-config.module.js';

/**
 * Background worker: the same modules as the API, without an HTTP server.
 * Runs the outbox relay, its handlers and scheduled jobs. In production API
 * instances run with OUTBOX_RELAY=off and one or more workers publish.
 * The relay's poll timer keeps the process alive until SIGTERM.
 */
await runOrExit(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    logger: STARTUP_LOG_LEVELS,
  });
  app.useLogger(RUNTIME_LOG_LEVELS);
  const config = app.get(AppConfigService);
  if (config.get('OUTBOX_RELAY', { infer: true }) === 'off') {
    await app.close();
    throw new Error(
      'The worker publishes outbox messages: OUTBOX_RELAY must not be "off" for it.',
    );
  }
  app.enableShutdownHooks();
  new Logger('Worker').log(
    'Worker started: outbox relay and scheduled jobs are running',
  );
});
