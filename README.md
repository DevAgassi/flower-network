# Flower Network

Omnichannel e-commerce platform for a city network of flower shops: online storefront with per-store availability, buy-online-pick-up-in-store, courier delivery, florist POS, multi-location inventory and owner analytics.

Built as a modular monolith (NestJS) with a TanStack Start frontend, in a pnpm + Turborepo monorepo.

| Document                                                        | Purpose                                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [init.md](init.md)                                              | Architecture specification: domain, database design, decisions (ADR), rules for AI assistants |
| [ROADMAP.md](ROADMAP.md)                                        | Module map, epics, feature registry with links to GitHub issues                               |
| [GitHub Project](https://github.com/users/DevAgassi/projects/1) | Board with the current status of every feature                                                |

## Repository layout

```
apps/
  api/                    NestJS backend (HTTP API), port 3001
  web/                    TanStack Start frontend (storefront, /admin, /pos), port 3000
packages/
  shared/                 Types and contracts shared between apps (@flower/shared)
  typescript-config/      Shared tsconfig presets (@flower/typescript-config)
infra/                    Config for local infrastructure (Prometheus, Grafana)
compose.yaml              Local infrastructure: PostgreSQL, pgAdmin, Redis, S3, Prometheus, Grafana
roadmap.config.json       Settings for gh roadmap (modules, Project title)
```

Every app is built and deployed independently. Shared code lives in `packages/*` and is consumed through each package's `exports` field only.

## Prerequisites

- Node.js 24 or newer
- pnpm 12 (`npm install -g pnpm@12`); the exact version is pinned in `package.json` → `packageManager`
- Docker with Docker Compose v2 (Docker Desktop on Windows / macOS)

## Getting started

```bash
pnpm install
pnpm infra:up     # start local infrastructure and wait until it is healthy
pnpm db:migrate   # apply database migrations
pnpm dev
```

- Web: http://localhost:3000 — the home page shows the API and database status
- API: http://localhost:3001/health — `200` when all checks are up, `503` otherwise

## Local infrastructure

Defined in [compose.yaml](compose.yaml). All ports are bound to `127.0.0.1`; credentials are development defaults and can be overridden by copying [.env.example](.env.example) to `.env`.

| Service             | URL / address                                                                     | Login                                                    |
| ------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| PostgreSQL 17       | `localhost:5433`, database `flower`                                               | `flower` / `flower`                                      |
| pgAdmin             | http://localhost:5051                                                             | none — opens directly, the database is already connected |
| Redis 8             | `localhost:6379`                                                                  | —                                                        |
| S3 storage (RustFS) | API `http://localhost:9000`, console http://localhost:9001, bucket `flower-media` | `flower` / `flower-secret`                               |
| Prometheus          | http://localhost:9090                                                             | —                                                        |
| Grafana             | http://localhost:3030                                                             | `admin` / `admin`, Prometheus data source preconfigured  |

PostgreSQL uses host port **5433** so it can run next to another local PostgreSQL on 5432.

| Command                  | What it does                                    |
| ------------------------ | ----------------------------------------------- |
| `pnpm infra:up`          | Starts all services and waits for health checks |
| `pnpm infra:down`        | Stops services, keeps data                      |
| `pnpm infra:logs`        | Follows logs of all services                    |
| `docker compose down -v` | Stops services and **deletes all local data**   |

Notes:

- Redis runs with `maxmemory-policy noeviction` and AOF persistence, as BullMQ requires.
- The `s3-init` service creates the bucket on start and exits; `Exited (0)` is expected.
- pgAdmin runs in desktop mode without its own login. That is safe only because the port is local; do not expose it.

## Database

[Drizzle ORM](https://orm.drizzle.team) with the `pg` driver (ADR-1 in [init.md](init.md)); migrations are SQL files generated by drizzle-kit in [apps/api/drizzle](apps/api/drizzle).

- `apps/api/src/database/database.module.ts` — global `DatabaseModule`; inject the instance with `@Inject(DATABASE) db: Database`.
- Every module defines its tables in `src/<module>/<module>.schema.ts` and re-exports them from [apps/api/src/database/schema.ts](apps/api/src/database/schema.ts), which drizzle-kit reads. Modules never import each other's tables.

| Command                                                        | What it does                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm db:migrate`                                              | Applies pending Drizzle migrations (table `drizzle.migrations`) and the outbox schema |
| `pnpm db:studio`                                               | Opens Drizzle Studio to browse data                                                   |
| `pnpm --filter @flower/api db:generate`                        | Generates a migration from schema changes                                             |
| `pnpm --filter @flower/api db:generate --custom --name=<name>` | Creates an empty migration for hand-written SQL (extensions, views)                   |
| `pnpm --filter @flower/api db:check`                           | Checks migration files for consistency                                                |

Workflow: change a `*.schema.ts` → `db:generate` → review the generated SQL → `db:migrate` → commit the schema and the migration together. Never edit a migration that is already on `main`; add a new one. Migrations run as a separate step (`db:migrate`), not on application start, so several API instances never race to migrate.

## Commands

All commands run from the repository root through Turborepo. Turborepo builds dependencies first (`^build`) and caches results.

| Command                             | What it does                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                          | Runs all apps in watch mode                                                  |
| `pnpm build`                        | Builds all packages and apps                                                 |
| `pnpm typecheck`                    | Type-checks every package                                                    |
| `pnpm lint`                         | Lints with oxlint                                                            |
| `pnpm test`                         | Runs unit tests (Vitest)                                                     |
| `pnpm format` / `pnpm format:check` | Formats / checks formatting with Prettier                                    |
| `pnpm github:sync`                  | Shortcut for `gh roadmap sync` — see [Roadmap and board](#roadmap-and-board) |

Run a task for one package only:

```bash
pnpm --filter @flower/api test:e2e
pnpm turbo run build --filter=@flower/web
```

Build only what changed compared to the default branch (used by CI to deploy apps independently):

```bash
pnpm turbo run build --affected
```

## Events between modules (outbox)

Modules never call each other to react to a change; they publish an event through the transactional outbox ([`@nestjs/outbox`](https://docs.nestjs.com/reliability/outbox), ADR-12 in [init.md](init.md)). The event is saved **in the same transaction** as the business change, so it is delivered if and only if the change committed — even if the process crashes right after the commit.

Produce an event — always inside the transaction of the change:

```ts
import { DATABASE, type Database } from '../database/database.module.js';
import type { AppOutbox } from '../outbox/outbox.module.js';

constructor(@Inject(DATABASE) private readonly db: Database, private readonly outbox: AppOutbox) {}

await this.db.transaction(async (tx) => {
  await tx.update(orders).set({ state: 'completed' }).where(eq(orders.id, id));
  await this.outbox.add(tx, { topic: 'order.completed', key: id, payload: { orderId: id } });
});
this.outbox.notify(); // optional: publish now instead of at the next poll (1 s)
```

Handle it — in any module, as a provider method:

```ts
@OnOutboxMessage('order.completed', { consumer: 'analytics-revenue' }) // stable consumer name
async addRevenue(payload: { orderId: string }, ctx: OutboxHandlerContext<Transaction>) {
  await this.db.transaction((tx) =>
    // inbox record and the write commit together: processed exactly once
    ctx.processInTransaction(tx, async () => { /* update rollup table through tx */ }),
  );
}
```

- `add()` without a transaction throws `OutboxTransactionRequiredError`.
- Delivery is at least once; the consumer's inbox drops duplicates. A failing handler is retried with backoff, then the message goes to the dead-letter table.
- `key`: messages with the same key are delivered in commit order (e.g. all events of one order).
- Tables live in the PostgreSQL schema `nest_outbox` (`messages`, `inbox`, `dead_letters`); inbox records older than 30 days are deleted daily.

**Processes.** In development the API also runs the relay — nothing extra to start. In production API instances run with `OUTBOX_RELAY=off` and one or more workers publish:

| Command                                  | What it does                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm --filter @flower/api dev:worker`   | Worker in watch mode (only needed to test the production setup locally)       |
| `pnpm --filter @flower/api start:worker` | Built worker, `NODE_ENV=production`; refuses to start with `OUTBOX_RELAY=off` |

`pnpm db:migrate` applies both the Drizzle migrations and the outbox schema. In production the app refuses to start while the outbox schema is behind.

## Development and production modes

The mode is `NODE_ENV`: `development` (default), `test` (set by Vitest) or `production`.

|                      | Development (`pnpm dev`)                                                 | Production (`pnpm start`)                                        |
| -------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Configuration source | Real environment variables, then `apps/<app>/.env`, then the root `.env` | Real environment variables only; `.env` files are ignored        |
| Missing variables    | Local defaults that match `compose.yaml`                                 | Required variables must be set, otherwise the app does not start |
| Code                 | Watch mode (Nest, Vite)                                                  | Built output (`pnpm start` builds first)                         |

Every variable is declared in a zod schema — [apps/api/src/config/env.schema.ts](apps/api/src/config/env.schema.ts) and [apps/web/src/env.server.ts](apps/web/src/env.server.ts). Both apps validate the environment **at startup** and exit with a list of every problem:

```
Invalid environment configuration:
  - PORT: Too big: expected number to be <=65535
  - DATABASE_URL: is required in production
```

Code never reads `process.env` directly: the API uses `AppConfigService` (`config.get('DATABASE_URL', { infer: true })`), the web server uses `getServerEnv()`. oxlint (`node/no-process-env`) enforces it outside the config files.

Run the production build locally:

```bash
# bash
DATABASE_URL=postgres://flower:flower@localhost:5433/flower API_URL=http://localhost:3001 pnpm start
```

```powershell
# PowerShell
$env:DATABASE_URL="postgres://flower:flower@localhost:5433/flower"; $env:API_URL="http://localhost:3001"; pnpm start
```

`NODE_ENV=production` is set by the `start` scripts; pnpm's `shellEmulator` makes that syntax work on Windows too. Turborepo passes only the variables listed in `turbo.json` → `passThroughEnv` to `dev` and `start`: add new runtime variables there as well.

## Environment variables

| Variable            | App                | Default (outside production)                     | Production                    | Purpose                                                                                  |
| ------------------- | ------------------ | ------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `NODE_ENV`          | api, web           | `development`                                    | `production` (set by `start`) | Mode, see above                                                                          |
| `PORT`              | api                | `3001`                                           | optional                      | HTTP port of the API                                                                     |
| `DATABASE_URL`      | api                | `postgres://flower:flower@localhost:5433/flower` | **required**                  | PostgreSQL connection string (also used by drizzle-kit)                                  |
| `DATABASE_POOL_MAX` | api                | `10`                                             | optional (1–100)              | Maximum connections in the pool                                                          |
| `OUTBOX_RELAY`      | api                | `on`                                             | `off` on API-only instances   | `on`: this process publishes outbox messages; `off`: only adds them (a worker publishes) |
| `API_URL`           | web                | `http://localhost:3001`                          | **required**                  | API base URL used by server functions                                                    |
| `PORT`              | web (built server) | `3000`                                           | optional                      | HTTP port of the built web server                                                        |

To add a variable: declare it in the app's schema, add it to `turbo.json` → `passThroughEnv`, document it here and, if it has a local default, in `.env.example`.

## Roadmap and board

The plan lives in [ROADMAP.md](ROADMAP.md); the [Project board](https://github.com/users/DevAgassi/projects/1) is generated from it by the [`gh roadmap`](https://github.com/DevAgassi/gh-roadmap) CLI extension, configured in [roadmap.config.json](roadmap.config.json).

One-time setup:

```bash
gh auth refresh -s project
gh extension install DevAgassi/gh-roadmap
```

After changing ROADMAP.md (new feature, new title, new dependency):

```bash
gh roadmap sync --dry-run   # validate
gh roadmap sync             # create/update issues, sub-issues, dependencies and board cards
```

Statuses set on the board are never overwritten; new issues start in **Backlog**. The meaning of each board column is described in [ROADMAP.md](ROADMAP.md#board-workflow).

## Conventions

- **Language:** code, comments and docs in English.
- **ESM only:** NestJS 12 is ESM; relative imports in `apps/api` end in `.js`.
- **Shared code:** add it to a package in `packages/*` and depend on it with `"workspace:*"`. Import only what the package exports — never deep paths into another package.
- **Formatting:** Prettier at the root. `ROADMAP.md` and `init.md` are excluded because the sync script parses their tables.
- **Workflow:** one branch and pull request per feature; the PR description closes the feature issue (`Closes #<number>`).

## License

[MIT](LICENSE)
