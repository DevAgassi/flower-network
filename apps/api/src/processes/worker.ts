import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../app.module.js';
import { runOrExit, STARTUP_LOG_LEVELS } from '../bootstrap.js';
import { AppConfigService } from '../config/app-config.module.js';
import { MetricsServer } from '../observability/metrics.js';

/**
 * Background worker: the same modules as the API, without the HTTP API.
 * Runs the outbox relay, its handlers and scheduled jobs, and serves /metrics
 * on METRICS_PORT. In production API instances run with OUTBOX_RELAY=off and
 * one or more workers publish. The relay's poll timer keeps the process alive
 * until SIGTERM.
 */
await runOrExit(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    bufferLogs: true,
    logger: STARTUP_LOG_LEVELS,
  });
  app.useLogger(app.get(Logger));
  const config = app.get(AppConfigService);
  if (config.get('OUTBOX_RELAY', { infer: true }) === 'off') {
    await app.close();
    throw new Error(
      'The worker publishes outbox messages: OUTBOX_RELAY must not be "off" for it.',
    );
  }
  app.enableShutdownHooks();
  await app
    .get(MetricsServer)
    .listen(config.get('METRICS_PORT', { infer: true }));
  new NestLogger('Worker').log(
    'Worker started: outbox relay and scheduled jobs are running',
  );
});
