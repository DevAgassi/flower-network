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
pnpm infra:up   # start local infrastructure and wait until it is healthy
pnpm dev
```

- Web: http://localhost:3000 — the home page shows the API health status
- API: http://localhost:3001/health

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

## Environment variables

| Variable  | App                    | Default                 | Purpose                               |
| --------- | ---------------------- | ----------------------- | ------------------------------------- |
| `PORT`    | api                    | `3001`                  | HTTP port of the API                  |
| `API_URL` | web                    | `http://localhost:3001` | API base URL used by server functions |
| `PORT`    | web (production build) | `3000`                  | HTTP port of the built web server     |

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
