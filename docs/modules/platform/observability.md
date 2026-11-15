---
title: Logs, traces and metrics
module: platform
kind: reference
audience: [developer]
---

# Logs, traces and metrics

The three signals that tell what the API and the worker are doing: **logs** (what happened), **traces** (where the time of one request went), **metrics** (how the system behaves over time).

Code: [`apps/api/src/observability/`](../../../apps/api/src/observability/) · Issue: [#27](https://github.com/DevAgassi/flower-network/issues/27)

| Signal  | Where to look locally                                                                             | Library                                      |
| ------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Logs    | The terminal of `pnpm dev` (pretty); stdout JSON in production                                    | `nestjs-pino` (pino 10)                      |
| Traces  | Jaeger UI http://localhost:16686, service `flower-api`                                            | OpenTelemetry (`@opentelemetry/sdk-trace` 3) |
| Metrics | Grafana http://localhost:3030 → Flower Network → API overview; raw: http://localhost:3001/metrics | `@prometheus-io/client`                      |

## Logs

Use Nest's `Logger` as before — it writes through pino:

```ts
private readonly logger = new Logger(OrdersService.name);

this.logger.log(`Order ${id} completed`); // level info, context "OrdersService"
```

A production line:

```json
{
  "level": "info",
  "time": "2026-11-15T21:06:53.782Z",
  "request_id": "3f2b…",
  "trace_id": "d572…",
  "span_id": "9f4f…",
  "context": "OrdersService",
  "msg": "Order 42 completed"
}
```

- **`request_id`** is on every line written during an HTTP request. It is taken from the incoming `x-request-id` header when it is safe (`[A-Za-z0-9._-]`, up to 128 characters), otherwise generated, and always returned in the `x-request-id` response header. Support can ask a user for it and find every line of that request.
- **`trace_id` / `span_id`** are added when a trace is active, so a log line leads to its trace in Jaeger.
- Each request ends with one `request completed` line: method, URL, status, `responseTime` in ms. `/health` and `/metrics` are not logged.
- `authorization`, `cookie`, `x-api-key` and `set-cookie` are redacted; request and response headers are not logged at all.
- Level: `LOG_LEVEL` (`info` by default, `silent` under Vitest). Development output is colored single lines (`pino-pretty`).

## Traces

Tracing starts in the entry points **before** the application is imported:

```ts
// src/main.ts
startTracing('flower-api');
await import('./processes/api.js');
```

The instrumentations patch libraries as they load, so anything imported earlier would not be traced. NestJS 12 is ESM: `startTracing()` registers import-in-the-middle's synchronous loader hook (`module.registerHooks`, Node.js 24.11.1+) for the instrumented packages only.

| Instrumented | Spans                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| `http`       | One root span per incoming request (`GET /health`); outgoing HTTP calls |
| `express`    | Middlewares and the route handler (`request handler - /health`)         |
| `pg`         | Every query inside a request (`pg.query:SELECT flower`), pool connects  |

- There are **no NestJS spans**: `@opentelemetry/instrumentation-nestjs-core` supports `@nestjs/core` < 12 only. The express route span already names the route. Added in PLT-13 ([#98](https://github.com/DevAgassi/flower-network/issues/98)) once upstream supports Nest 12.
- Queries outside a request (the outbox relay polls every second) are **not** traced (`requireParentSpan`), otherwise every poll would be a trace.
- `/metrics` requests are not traced.
- Spans are batched and sent over OTLP/HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT`. In development it defaults to the local Jaeger; elsewhere tracing is off unless the variable is set. Buffered spans are flushed on shutdown.
- Service names: `flower-api`, `flower-worker`.

## Metrics

`GET /metrics` on the API (port `PORT`) and on the worker (port `METRICS_PORT`, default 9464), in the Prometheus text format. Prometheus scrapes both every 15 s ([infra/prometheus/prometheus.yml](../../../infra/prometheus/prometheus.yml)).

| Metric                                                                                              | Type      | Labels                      | Where                        |
| --------------------------------------------------------------------------------------------------- | --------- | --------------------------- | ---------------------------- |
| `process_*`, `nodejs_*`                                                                             | various   | —                           | every process                |
| `http_request_duration_seconds`                                                                     | histogram | `method`, `route`, `status` | API                          |
| `outbox_messages_published_total`                                                                   | counter   | `topic`                     | process running the relay    |
| `outbox_publish_duration_seconds`                                                                   | histogram | `topic`                     | process running the relay    |
| `outbox_messages_retried_total`                                                                     | counter   | `topic`                     | process running the relay    |
| `outbox_messages_dead_lettered_total`                                                               | counter   | `topic`, `reason`           | process running the relay    |
| `outbox_leases_lost_total`                                                                          | counter   | —                           | process running the relay    |
| `outbox_messages_pending`, `outbox_dead_letters`, `outbox_lag_seconds`, `outbox_messages_in_flight` | gauge     | —                           | only where `OUTBOX_RELAY=on` |

- `route` is the matched pattern (`/orders/:id`), never the raw URL; unmatched requests are `unmatched`. This keeps the number of series bounded.
- Outbox counters come from the package's `OutboxEvents` stream; backlog gauges run one `relay.stats()` query per scrape. API instances with `OUTBOX_RELAY=off` do not report the gauges, so the same backlog is not counted twice.

Add a metric in any module by injecting the global `Registry`:

```ts
constructor(registry: Registry) {
  this.sales = new Counter({ name: 'pos_sales_total', help: 'POS sales', labelNames: ['location'], registers: [registry] });
}
```

Label values must come from a small fixed set (location codes, topics) — never ids, URLs or user input.

### Grafana dashboard

**API overview** ([infra/grafana/dashboards/api-overview.json](../../../infra/grafana/dashboards/api-overview.json)), provisioned read-only: API up, outbox pending / dead letters / lag, requests per second by route, 5xx share, latency p50/p95/p99 by route, outbox throughput, event-loop lag, memory. To change it: edit in Grafana, export the JSON, replace the file.

## Rules

- Log with Nest's `Logger`; never `console.log` in application code.
- Never log secrets, tokens, full request bodies or personal data.
- Metric labels have bounded values only.
- New entry points call `startTracing(<service>)` first and import the app dynamically.
