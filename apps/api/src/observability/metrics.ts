import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  Controller,
  Get,
  Header,
  Injectable,
  Logger,
  type NestMiddleware,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
  Res,
} from '@nestjs/common';
import { OutboxEvents, OutboxRelay } from '@nestjs/outbox';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from '@prometheus-io/client';
import type { NextFunction, Request, Response } from 'express';
import type { Subscription } from 'rxjs';
import { AppConfigService } from '../config/app-config.module.js';

/** One registry per process; every metric of the app registers here. */
export function createRegistry(): Registry {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  return registry;
}

/** Latency buckets in seconds, from fast reads to slow writes. */
const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * http_request_duration_seconds by method, route template and status. The
 * route is the matched pattern (`/orders/:id`), never the raw URL, so the
 * number of series stays bounded.
 */
@Injectable()
export class HttpMetrics {
  readonly duration: Histogram<'method' | 'route' | 'status'>;

  constructor(registry: Registry) {
    this.duration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests handled by the API',
      labelNames: ['method', 'route', 'status'],
      buckets: HTTP_BUCKETS,
      registers: [registry],
    });
  }
}

/**
 * The matched route pattern. A 404 from Nest's catch-all route (`{/*splat}`)
 * and requests that matched nothing become `unmatched`.
 */
export function routeLabel(req: Request, res: Response): string {
  const path = (req.route as { path?: string } | undefined)?.path;
  if (!path || (res.statusCode === 404 && path.includes('*'))) {
    return 'unmatched';
  }
  return `${req.baseUrl}${path}`;
}

/**
 * Times every request. Nest creates its own instance of a middleware class,
 * so the metric lives in HttpMetrics, not here.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: HttpMetrics) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const end = this.metrics.duration.startTimer();
    res.once('finish', () => {
      end({
        method: req.method,
        route: routeLabel(req, res),
        status: String(res.statusCode),
      });
    });
    next();
  }
}

/**
 * Outbox metrics. Counters come from the relay's event stream, so they exist
 * in the process that runs the relay. The backlog gauges read the tables on
 * scrape and are registered only where the relay runs, so API instances with
 * OUTBOX_RELAY=off do not report the same numbers again.
 */
@Injectable()
export class OutboxMetrics implements OnModuleInit, OnModuleDestroy {
  private subscription?: Subscription;
  private readonly published: Counter<'topic'>;
  private readonly publishDuration: Histogram<'topic'>;
  private readonly retried: Counter<'topic'>;
  private readonly deadLettered: Counter<'topic' | 'reason'>;
  private readonly leaseLost: Counter;

  constructor(
    private readonly registry: Registry,
    private readonly events: OutboxEvents,
    private readonly relay: OutboxRelay,
    private readonly config: AppConfigService,
  ) {
    const registers = [registry];
    this.published = new Counter({
      name: 'outbox_messages_published_total',
      help: 'Outbox messages delivered to their handlers',
      labelNames: ['topic'],
      registers,
    });
    this.publishDuration = new Histogram({
      name: 'outbox_publish_duration_seconds',
      help: 'Time to deliver one outbox message',
      labelNames: ['topic'],
      buckets: HTTP_BUCKETS,
      registers,
    });
    this.retried = new Counter({
      name: 'outbox_messages_retried_total',
      help: 'Failed deliveries scheduled for another attempt',
      labelNames: ['topic'],
      registers,
    });
    this.deadLettered = new Counter({
      name: 'outbox_messages_dead_lettered_total',
      help: 'Outbox messages moved to the dead-letter table',
      labelNames: ['topic', 'reason'],
      registers,
    });
    this.leaseLost = new Counter({
      name: 'outbox_leases_lost_total',
      help: 'Messages another relay took over while this one was publishing',
      registers,
    });
  }

  onModuleInit(): void {
    this.subscription = this.events.events$.subscribe((event) => {
      const topic = event.message.topic;
      switch (event.type) {
        case 'published':
          this.published.inc({ topic });
          this.publishDuration.observe({ topic }, event.durationMs / 1000);
          break;
        case 'retry-scheduled':
          this.retried.inc({ topic });
          break;
        case 'dead-lettered':
          this.deadLettered.inc({ topic, reason: event.reason });
          break;
        case 'lease-lost':
          this.leaseLost.inc();
          break;
      }
    });
    if (this.config.get('OUTBOX_RELAY', { infer: true }) === 'on') {
      this.registerBacklogGauges();
    }
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private registerBacklogGauges(): void {
    const relay = this.relay;
    // One stats() query per scrape, shared by all four gauges.
    let pendingStats: ReturnType<OutboxRelay['stats']> | undefined;
    const stats = () => {
      pendingStats ??= relay.stats().finally(() => {
        pendingStats = undefined;
      });
      return pendingStats;
    };
    const gauge = (
      name: string,
      help: string,
      read: (s: Awaited<ReturnType<OutboxRelay['stats']>>) => number,
    ) =>
      new Gauge({
        name,
        help,
        registers: [this.registry],
        async collect() {
          this.set(read(await stats()));
        },
      });
    gauge(
      'outbox_messages_pending',
      'Outbox messages not yet published',
      (s) => s.pending,
    );
    gauge(
      'outbox_dead_letters',
      'Messages in the dead-letter table',
      (s) => s.deadLetters,
    );
    gauge(
      'outbox_lag_seconds',
      'How long the oldest ready message has waited',
      (s) => s.lagMs / 1000,
    );
    gauge(
      'outbox_messages_in_flight',
      'Messages this relay is publishing right now',
      (s) => s.inFlight,
    );
  }
}

/** GET /metrics on the API, in the Prometheus text format. Not part of the API contract. */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly registry: Registry) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async metrics(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.type(this.registry.contentType);
    return this.registry.metrics();
  }
}

/**
 * /metrics for processes without an HTTP server (the worker). Started
 * explicitly with listen(); closed on shutdown.
 */
@Injectable()
export class MetricsServer implements OnApplicationShutdown {
  private readonly logger = new Logger(MetricsServer.name);
  private server?: Server;

  constructor(private readonly registry: Registry) {}

  /** Starts listening; returns the bound port (useful with port 0 in tests). */
  async listen(port: number): Promise<number> {
    const server = createServer((req, res) => {
      if (req.method !== 'GET' || req.url?.split('?')[0] !== '/metrics') {
        res.writeHead(404).end();
        return;
      }
      this.registry.metrics().then(
        (body) => {
          res.writeHead(200, { 'Content-Type': this.registry.contentType });
          res.end(body);
        },
        (err: unknown) => {
          this.logger.warn(`Metrics collection failed: ${String(err)}`);
          res.writeHead(500).end();
        },
      );
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, resolve);
    });
    this.server = server;
    const bound = (server.address() as AddressInfo).port;
    this.logger.log(`Metrics on http://localhost:${bound}/metrics`);
    return bound;
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
