---
title: Continuous integration
module: process
kind: process
audience: [developer]
---

# Continuous integration

Every pull request and every push to `main` runs [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) on GitHub Actions. A pull request can be merged only when both jobs are green (branch rule on `main`). Issue: [#29](https://github.com/DevAgassi/flower-network/issues/29).

```mermaid
flowchart LR
  pr[Pull request / push to main] --> checks
  pr --> db
  subgraph checks[Job: checks]
    f[format] --> l[lint] --> t[typecheck] --> u[unit tests] --> b[build] --> d[docs] --> r[roadmap]
  end
  subgraph db["Job: database (PostgreSQL 17 service)"]
    m[migrations on an empty DB] --> e[e2e tests] --> g[no missing migration] --> c[contract up to date]
  end
```

## What runs

| Job        | Step                                 | Local command                                                                                | Fails when                                                  |
| ---------- | ------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `checks`   | Format                               | `pnpm format:check`                                                                          | A file is not Prettier-formatted → `pnpm format`            |
|            | Lint                                 | `pnpm lint`                                                                                  | oxlint reports an error                                     |
|            | Typecheck                            | `pnpm typecheck`                                                                             | Any package has a type error                                |
|            | Unit tests                           | `pnpm test`                                                                                  | A unit test fails (incl. "openapi.json is up to date")      |
|            | Build                                | `pnpm build`                                                                                 | Any package does not build                                  |
|            | Docs                                 | `pnpm docs:check`                                                                            | A broken relative link or anchor, missing frontmatter       |
|            | Roadmap                              | `gh roadmap sync --dry-run`                                                                  | `ROADMAP.md` cannot be parsed                               |
| `database` | Migrations                           | `pnpm db:migrate`                                                                            | A migration does not apply to an empty database             |
|            | E2E tests                            | `pnpm --filter @flower/api test:e2e`                                                         | An e2e test fails                                           |
|            | No schema change without a migration | `pnpm --filter @flower/api db:check && pnpm --filter @flower/api db:generate` → no new files | A `*.schema.ts` changed but its migration was not generated |
|            | API contract up to date              | `pnpm api:generate` → no diff                                                                | `openapi.json` or the client types were not regenerated     |

All at once before pushing (needs `pnpm infra:up`):

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm docs:check
pnpm --filter @flower/api test:e2e
pnpm api:generate && git status --short   # must print nothing new
```

## Environment

- `ubuntu-latest`, Node.js **24** — the minimum in `package.json` → `engines`; local development may use a newer Node.
- [`pnpm/setup`](https://github.com/pnpm/setup) installs the pnpm version from `packageManager`, Node.js, runs `pnpm install` (frozen lockfile in CI) and caches the store.
- The `database` job gets a `postgres:17-alpine` service container (user, password and database `flower`) and `DATABASE_URL=postgres://flower:flower@localhost:5432/flower`. No other service from `compose.yaml` is started.
- A newer push to the same branch cancels the running workflow.

## When CI is red

1. Open the failing job in the pull request's **Checks** tab; the failing step is expanded.
2. Run the local command from the table above, fix, push. Generated-file steps print what to run (`pnpm api:generate`, `db:generate`).
3. Do not merge around a red check: the branch rule blocks it, and a red `main` blocks everyone.

## Changing the workflow

- Keep job names `checks` and `database`: the branch rule on `main` requires them by name. Renaming a job means updating the rule (repository **Settings → Branches**).
- Actions are pinned to major tags (`actions/checkout@v7`, `pnpm/setup@v3`).
- A new required check is a new step in one of the jobs, or a new job added to the branch rule.
