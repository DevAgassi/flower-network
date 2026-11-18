---
title: Monorepo and build
module: platform
kind: reference
audience: [developer]
---

# Monorepo and build

pnpm 12 workspaces with Turborepo 2 (ADR-10 in [init.md](../../../init.md)). Every app is built and deployed independently; shared code lives in packages.

## Layout

```
apps/
  api/                    NestJS 12 backend: HTTP API (src/main.ts) and worker (src/worker.ts), port 3001
  web/                    TanStack Start frontend: storefront, /admin, /pos; port 3000
packages/
  api-client/             Typed API client generated from apps/api/openapi.json (@flower/api-client)
  shared/                 Non-HTTP code shared between apps (@flower/shared; empty for now)
  typescript-config/      Shared tsconfig presets (@flower/typescript-config)
infra/                    Config for local infrastructure (Prometheus, Grafana)
docs/                     Project documentation
```

## Rules

- **Shared code** goes into a package in `packages/*`, consumed with `"workspace:*"`. Import only what the package lists in its `exports` field — never a deep path into another package.
- **ESM only.** NestJS 12 is ESM: relative imports in `apps/api` end in `.js`, there is no `__dirname` (use `import.meta.dirname`). The web app uses the `#/*` import alias for `src/*`.
- **Business modules** move into a package only when a second app starts using them (ADR-10).
- **Packages are built** before their consumers: `@flower/shared` compiles to `dist/`, and every task that needs it depends on `^build`.

## Turborepo tasks

Defined in [turbo.json](../../../turbo.json).

| Task        | Depends on | Cached | Notes                                 |
| ----------- | ---------- | ------ | ------------------------------------- |
| `build`     | `^build`   | yes    | Outputs `dist/**`, `.output/**`       |
| `typecheck` | `^build`   | yes    |                                       |
| `lint`      | —          | yes    | oxlint                                |
| `test`      | `^build`   | yes    | Vitest unit tests                     |
| `dev`       | `^build`   | no     | Persistent, watch mode                |
| `start`     | `build`    | no     | Persistent, runs the production build |

Turborepo runs in strict environment mode: a task sees only variables listed in its `passThroughEnv`. A new runtime variable must be added there for `dev` and `start`, otherwise the app silently falls back to its default (see the [journal](journal.md)).

## Commands

All from the repository root.

| Command                                      | What it does                                          |
| -------------------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                                   | All apps in watch mode                                |
| `pnpm build`                                 | Builds all packages and apps                          |
| `pnpm start`                                 | Builds, then runs every app in production mode        |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Checks across all packages                            |
| `pnpm format` / `pnpm format:check`          | Prettier at the root                                  |
| `pnpm --filter @flower/api <script>`         | Runs one package's script, e.g. `test:e2e`            |
| `pnpm turbo run build --filter=@flower/web`  | One task for one package and its dependencies         |
| `pnpm turbo run build --affected`            | Only packages changed against the default branch (CI) |

## pnpm settings

[pnpm-workspace.yaml](../../../pnpm-workspace.yaml):

- `allowBuilds` — pnpm blocks install scripts by default; only listed dependencies may run them (`esbuild`, `lightningcss`).
- `shellEmulator: true` — scripts run in a cross-platform shell, so `NODE_ENV=production node …` works on Windows.

The pnpm version is pinned in `package.json` → `packageManager`.

## Formatting and linting

- Prettier formats everything except files listed in [.prettierignore](../../../.prettierignore): `ROADMAP.md` and `init.md` (their tables are parsed by `gh roadmap`) and generated Drizzle metadata.
- oxlint runs type-aware in the API. It prints **nothing** when there are no problems.
