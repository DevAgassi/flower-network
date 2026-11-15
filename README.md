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
scripts/
  github/seed-issues.mjs  Syncs ROADMAP.md to GitHub issues and the Project board
```

Every app is built and deployed independently. Shared code lives in `packages/*` and is consumed through each package's `exports` field only.

## Prerequisites

- Node.js 24 or newer
- pnpm 12 (`npm install -g pnpm@12`); the exact version is pinned in `package.json` → `packageManager`

## Getting started

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:3000 — the home page shows the API health status
- API: http://localhost:3001/health

## Commands

All commands run from the repository root through Turborepo. Turborepo builds dependencies first (`^build`) and caches results.

| Command                             | What it does                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Runs all apps in watch mode                                                                     |
| `pnpm build`                        | Builds all packages and apps                                                                    |
| `pnpm typecheck`                    | Type-checks every package                                                                       |
| `pnpm lint`                         | Lints with oxlint                                                                               |
| `pnpm test`                         | Runs unit tests (Vitest)                                                                        |
| `pnpm format` / `pnpm format:check` | Formats / checks formatting with Prettier                                                       |
| `pnpm github:sync`                  | Syncs ROADMAP.md to GitHub issues and the Project (needs `gh` with `repo` and `project` scopes) |

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

## Conventions

- **Language:** code, comments and docs in English.
- **ESM only:** NestJS 12 is ESM; relative imports in `apps/api` end in `.js`.
- **Shared code:** add it to a package in `packages/*` and depend on it with `"workspace:*"`. Import only what the package exports — never deep paths into another package.
- **Formatting:** Prettier at the root. `ROADMAP.md` and `init.md` are excluded because the sync script parses their tables.
- **Workflow:** one branch and pull request per feature; the PR description closes the feature issue (`Closes #<number>`).
