import type { OutboxEvent, OutboxEvents, OutboxRelay } from '@nestjs/outbox';
import type { Registry } from '@prometheus-io/client';
import type { Request, Response } from 'express';
import { Subject } from 'rxjs';
import type { AppConfigService } from '../config/app-config.module.js';
import {
  createRegistry,
  MetricsServer,
  OutboxMetrics,
  routeLabel,
} from './metrics.js';

describe('routeLabel', () => {
  const res = (statusCode: number) => ({ statusCode }) as Response;
  const req = (path?: string, baseUrl = '') =>
    ({ route: path ? { path } : undefined, baseUrl }) as unknown as Request;

  it('uses the matched route pattern, never the raw URL', () => {
    expect(routeLabel(req('/orders/:id'), res(200))).toBe('/orders/:id');
    expect(routeLabel(req('/:id', '/orders'), res(200))).toBe('/orders/:id');
  });

  it('labels requests that matched no route as unmatched', () => {
    expect(routeLabel(req(), res(404))).toBe('unmatched');
    expect(routeLabel(req('{/*splat}'), res(404))).toBe('unmatched');
  });
});

describe('OutboxMetrics', () => {
  let registry: Registry;
  let events: Subject<OutboxEvent>;
  const stats = vi.fn();

  function create(relay: 'on' | 'off'): OutboxMetrics {
    registry = createRegistry();
    events = new Subject<OutboxEvent>();
    const metrics = new OutboxMetrics(
      registry,
      { events$: events } as unknown as OutboxEvents,
      { stats } as unknown as OutboxRelay,
      { get: () => relay } as unknown as AppConfigService,
    );
    metrics.onModuleInit();
    return metrics;
  }

  const message = { topic: 'order.completed' } as OutboxEvent['message'];

  beforeEach(() => {
    stats.mockReset().mockResolvedValue({
      pending: 3,
      ready: 3,
      leased: 0,
      deadLetters: 1,
      lagMs: 2500,
      inFlight: 0,
    });
  });

  it('counts relay events by topic', async () => {
    const metrics = create('on');

    events.next({
      type: 'published',
      message,
      transport: 'local',
      durationMs: 20,
    });
    events.next({
      type: 'published',
      message,
      transport: 'local',
      durationMs: 40,
    });
    events.next({
      type: 'retry-scheduled',
      message,
      transport: 'local',
      error: new Error('down'),
      attempt: 1,
      delayMs: 1000,
    });
    events.next({
      type: 'dead-lettered',
      message,
      transport: 'local',
      error: new Error('bad'),
      attempt: 1,
      reason: 'rejected',
    });
    metrics.onModuleDestroy();
    const text = await registry.metrics();

    expect(text).toContain(
      'outbox_messages_published_total{topic="order.completed"} 2',
    );
    expect(text).toContain(
      'outbox_messages_retried_total{topic="order.completed"} 1',
    );
    expect(text).toContain(
      'outbox_messages_dead_lettered_total{topic="order.completed",reason="rejected"} 1',
    );
    expect(text).toContain(
      'outbox_publish_duration_seconds_count{topic="order.completed"} 2',
    );
  });

  it('reports the backlog where the relay runs, with one stats query per scrape', async () => {
    create('on');

    const text = await registry.metrics();

    expect(text).toContain('outbox_messages_pending 3');
    expect(text).toContain('outbox_dead_letters 1');
    expect(text).toContain('outbox_lag_seconds 2.5');
    expect(stats).toHaveBeenCalledTimes(1);
  });

  it('does not report the backlog on API instances with OUTBOX_RELAY=off', async () => {
    create('off');

    const text = await registry.metrics();

    expect(text).not.toContain('outbox_messages_pending');
    expect(stats).not.toHaveBeenCalled();
  });
});

describe('MetricsServer', () => {
  it('serves /metrics in the Prometheus format and 404 elsewhere', async () => {
    const server = new MetricsServer(createRegistry());
    const port = await server.listen(0);
    try {
      const metrics = await fetch(`http://localhost:${port}/metrics`);
      const other = await fetch(`http://localhost:${port}/`);

      expect(metrics.status).toBe(200);
      expect(metrics.headers.get('content-type')).toContain('text/plain');
      expect(await metrics.text()).toContain('process_cpu_user_seconds_total');
      expect(other.status).toBe(404);
    } finally {
      await server.onApplicationShutdown();
    }
  });
});
