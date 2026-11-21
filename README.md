# Flower Network

[![CI](https://github.com/DevAgassi/flower-network/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/DevAgassi/flower-network/actions/workflows/ci.yml)

Omnichannel e-commerce platform for a city network of flower shops: online storefront with per-store availability, buy-online-pick-up-in-store, courier delivery, florist POS, multi-location inventory and owner analytics.

Built as a modular monolith (NestJS) with a TanStack Start frontend, in a pnpm + Turborepo monorepo.

| Document                                                        | Purpose                                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [docs/](docs/README.md)                                         | How every module and process works, its problems and solutions, guides per role               |
| [init.md](init.md)                                              | Architecture specification: domain, database design, decisions (ADR), rules for AI assistants |
| [ROADMAP.md](ROADMAP.md)                                        | Module map, epics, feature registry with links to GitHub issues                               |
| [GitHub Project](https://github.com/users/DevAgassi/projects/1) | Board with the current status of every feature                                                |
| [CLAUDE.md](CLAUDE.md)                                          | Short guide for AI assistants: commands, code rules, workflow                                 |

## Repository layout

```
apps/
  api/                    NestJS backend: HTTP API and worker, port 3001
  web/                    TanStack Start frontend (storefront, /admin, /pos), port 3000
packages/
  api-client/             Typed API client generated from the OpenAPI document (@flower/api-client)
  shared/                 Non-HTTP code shared between apps (@flower/shared)
  typescript-config/      Shared tsconfig presets (@flower/typescript-config)
infra/                    Config for local infrastructure (Prometheus, Grafana)
docs/                     Project documentation
compose.yaml              Local infrastructure: PostgreSQL, pgAdmin, Redis, S3, Prometheus, Grafana
roadmap.config.json       Settings for gh roadmap (modules, Project title)
```

Every app is built and deployed independently. Shared code lives in `packages/*` and is consumed through each package's `exports` field only. More: [Monorepo and build](docs/modules/platform/monorepo.md).

## Prerequisites

- Node.js 24 or newer
- pnpm 12 (`npm install -g pnpm@12`); the exact version is pinned in `package.json` → `packageManager`
- Docker with Docker Compose v2 (Docker Desktop on Windows / macOS)

## Getting started

```bash
pnpm install
pnpm infra:up     # start local infrastructure and wait until it is healthy
pnpm db:migrate   # apply database migrations
pnpm --filter @flower/api user:create --email you@example.com --name "Your Name" --role owner   # first owner
pnpm dev
```

- Web: http://localhost:3000 — the home page shows the API and database status
- API: http://localhost:3001/health — `200` when all checks are up, `503` otherwise; API docs at http://localhost:3001/docs

| Local service       | Address                              | Login                      |
| ------------------- | ------------------------------------ | -------------------------- |
| PostgreSQL 17       | `localhost:5433`, database `flower`  | `flower` / `flower`        |
| pgAdmin             | http://localhost:5051                | none, already connected    |
| Redis 8             | `localhost:6379`                     | —                          |
| S3 storage (RustFS) | http://localhost:9000, console :9001 | `flower` / `flower-secret` |
| Prometheus          | http://localhost:9090                | —                          |
| Grafana             | http://localhost:3030                | `admin` / `admin`          |
| Jaeger (traces)     | http://localhost:16686               | —                          |

Details and commands: [Local infrastructure](docs/modules/platform/local-infrastructure.md).

## Commands

All commands run from the repository root through Turborepo.

| Command                              | What it does                                              |
| ------------------------------------ | --------------------------------------------------------- |
| `pnpm dev`                           | Runs all apps in watch mode                               |
| `pnpm build`                         | Builds all packages and apps                              |
| `pnpm start`                         | Builds and runs all apps in production mode               |
| `pnpm typecheck`                     | Type-checks every package                                 |
| `pnpm lint`                          | Lints with oxlint                                         |
| `pnpm test`                          | Runs unit tests (Vitest)                                  |
| `pnpm --filter @flower/api test:e2e` | Runs e2e tests against the local database                 |
| `pnpm format` / `pnpm format:check`  | Formats / checks formatting with Prettier                 |
| `pnpm docs:check`                    | Checks links and frontmatter in the documentation         |
| `pnpm infra:up` / `infra:down`       | Starts / stops local infrastructure                       |
| `pnpm db:migrate` / `db:studio`      | Applies migrations / opens Drizzle Studio                 |
| `pnpm api:generate`                  | Regenerates the OpenAPI document and the typed API client |
| `pnpm github:sync`                   | Syncs ROADMAP.md to the board (`gh roadmap sync`)         |

## Where things are explained

| Topic                                         | Document                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Environment variables, development/production | [Configuration](docs/modules/platform/configuration.md)                                           |
| Drizzle, schemas, migrations                  | [Database](docs/modules/platform/database.md)                                                     |
| Events between modules                        | [Outbox](docs/modules/platform/outbox.md)                                                         |
| HTTP API contract, typed client               | [API contract](docs/modules/platform/api-contract.md)                                             |
| Logs, traces, metrics                         | [Observability](docs/modules/platform/observability.md)                                           |
| API, worker, health check                     | [API and worker](docs/apps/api.md)                                                                |
| Frontend                                      | [Web](docs/apps/web.md)                                                                           |
| Issues, branches, pull requests, board        | [Workflow](docs/process/workflow.md)                                                              |
| Continuous integration                        | [CI](docs/process/ci.md)                                                                          |
| Problems we solved and their lessons          | [Platform journal](docs/modules/platform/journal.md) · [Process journal](docs/process/journal.md) |

## License

[MIT](LICENSE)
