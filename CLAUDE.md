# CLAUDE.md

Guide for AI assistants working in this repository. Keep it short: details live in [docs/](docs/README.md).

Flower Network — omnichannel e-commerce for a city network of flower shops. Modular monolith: NestJS 12 API + worker, TanStack Start web app, pnpm 12 + Turborepo monorepo, PostgreSQL 17 via Drizzle.

## Where to look

| Need                                            | Read                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Architecture, domain, DB design, ADRs, AI rules | [init.md](init.md) (Ukrainian) — rules in §8, ADRs in §9               |
| Features, IDs, dependencies, issue links        | [ROADMAP.md](ROADMAP.md)                                               |
| How a module or piece works, its past problems  | [docs/modules/\<module\>/](docs/README.md) — `README.md`, `journal.md` |
| Processes (API, worker, web)                    | [docs/apps/](docs/apps/)                                               |
| Issue → branch → PR → merge                     | [docs/process/workflow.md](docs/process/workflow.md)                   |

Before working on a module, read its `docs/modules/<module>/` folder, including the journal.

## Commands

```bash
pnpm install
pnpm infra:up                          # Docker: PostgreSQL :5433, pgAdmin :5051, Redis, S3, Prometheus, Grafana :3030, Jaeger :16686
pnpm db:migrate                        # Drizzle migrations + outbox schema
pnpm dev                               # api :3001 (with outbox relay) + web :3000

pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @flower/api test:e2e     # real PostgreSQL, needs infra:up
pnpm build
pnpm --filter @flower/api db:generate  # migration from *.schema.ts changes
pnpm --filter @flower/api db:check
gh roadmap sync --dry-run              # after editing ROADMAP.md; without --dry-run it writes to GitHub
```

oxlint prints nothing when there are no problems.

## Repository map

```
apps/api/src/
  main.ts, worker.ts      entry points: start tracing, then import processes/api.ts | processes/worker.ts
  config/                 zod env schema, AppConfigModule, AppConfigService
  database/               DatabaseModule (DATABASE token, Transaction type), schema.ts registry
  outbox/                 AppOutboxModule (@nestjs/outbox, schema nest_outbox), inbox retention
  observability/          OpenTelemetry tracing, pino logging, Prometheus metrics (GET /metrics)
  health/                 GET /health (database, outbox)
  <module>/               business modules, from Stage 2
apps/api/test/            e2e tests
apps/api/drizzle/         SQL migrations (generated)
apps/web/src/             TanStack Start: routes/, env.server.ts, server-plugins/
packages/shared/          @flower/shared — types shared by api and web
docs/                     documentation (rules: docs/README.md)
```

## Code rules

- **Language:** code, comments, docs, commits and issues in English; conversation with the project owner in Ukrainian.
- **ESM:** relative imports in `apps/api` end in `.js`; no `__dirname`. Tests use Vitest (`vi.fn()`).
- **Config:** never read `process.env`; use `AppConfigService.get(key, { infer: true })` (api) or `getServerEnv()` (web). A new variable: schema + `turbo.json` `passThroughEnv` + [configuration doc](docs/modules/platform/configuration.md).
- **Database:** inject `@Inject(DATABASE) db: Database`. Module tables in `src/<module>/<module>.schema.ts`, re-exported from `src/database/schema.ts`. Modules never import each other's tables. Never edit a migration on `main`.
- **Events:** only through the outbox — `outbox.add(tx, { topic, key, payload })` inside the `db.transaction()` of the change. Handlers: `@OnOutboxMessage(topic, { consumer })` with a permanent consumer name, idempotent, writes via `ctx.processInTransaction(tx, …)`.
- **Domain:** multi-location (`location_id`) and variant-level (`variant_id`); stock changes in a transaction with a `stock_movements` record; money `bigint` kopecks; time `timestamptz` UTC. Full list: init.md §8.
- **Shared code:** in `packages/*`, imported only through the package's `exports`.
- **Logs and metrics:** log with Nest's `Logger` (pino underneath), never `console.log` in app code; no secrets or personal data in logs. Metrics register on the injected global `Registry`; label values from small fixed sets only.
- **Long-lived clients** (pg, Redis, BullMQ) need an `error` listener, or a dropped connection crashes the process.

## Workflow

1. Before starting a feature, rewrite its GitHub issue in detail (why, how, decision, tasks, out of scope, acceptance, glossary) — [#26](https://github.com/DevAgassi/flower-network/issues/26) is the reference.
2. Branch `feat/<feature-id>-<slug>` from `main`; commit subject `PLT-04: …`.
3. One PR per feature with `Closes #N`; the same PR sets the feature to `done` in ROADMAP.md and updates `docs/`.
4. Board columns are moved by the owner by hand; do not bulk-edit the board.
5. Stacked PRs: merge one at a time, retarget to `main` before deleting a base branch, never in a loop.

## Documentation duty

In the same PR as the code ([details](docs/README.md#when-to-write-what)):

- changed behaviour → update the module's reference doc;
- new staff screen or procedure → a guide per role in `docs/modules/<module>/guides/`;
- non-obvious problem solved → entry in the module's `journal.md` (symptom, cause, fix, lesson);
- implementation departs from [init.md](init.md) (a decision or design changed) → update `init.md` too; it stays the spec until PLT-14 ([#99](https://github.com/DevAgassi/flower-network/issues/99)) migrates it into `docs/`;
- the repository is public: no secrets or personal data in docs.
