import {
  Global,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Registry } from '@prometheus-io/client';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.module.js';
import { loggerParams } from './logging.js';
import {
  createRegistry,
  HttpMetrics,
  HttpMetricsMiddleware,
  MetricsController,
  MetricsServer,
  OutboxMetrics,
} from './metrics.js';
import { shutdownTracing } from './tracing.js';

/**
 * Logs, metrics and the end of tracing (tracing itself starts in the entry
 * point, before Nest is imported). `Registry` is global: any module can add
 * its own metrics with `registers: [registry]`.
 */
@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        loggerParams({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
        }),
    }),
  ],
  controllers: [MetricsController],
  providers: [
    { provide: Registry, useFactory: createRegistry },
    HttpMetrics,
    OutboxMetrics,
    MetricsServer,
  ],
  exports: [Registry, MetricsServer],
})
export class ObservabilityModule implements NestModule, OnApplicationShutdown {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('{*path}');
  }

  async onApplicationShutdown(): Promise<void> {
    // Runs after the HTTP server stopped: sends the spans still buffered.
    await shutdownTracing();
  }
}
