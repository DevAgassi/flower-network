---
title: Configuration and modes
module: platform
kind: reference
audience: [developer]
---

# Configuration and modes

Every environment variable an app reads is declared in a zod schema and validated **at startup**. In production a missing required value stops the process before it serves anything (twelve-factor config, fail fast).

Code: API [`apps/api/src/config/`](../../../apps/api/src/config/) · Web [`apps/web/src/env.server.ts`](../../../apps/web/src/env.server.ts), [`apps/web/src/server-plugins/validate-env.ts`](../../../apps/web/src/server-plugins/validate-env.ts)

## How to use it

API — inject the typed service:

```ts
constructor(private readonly config: AppConfigService) {}

const url = this.config.get('DATABASE_URL', { infer: true }); // string, already validated
```

Scripts outside Nest (drizzle-kit, migrations) call `loadEnv()` from `env-files.ts`: the same files and the same schema.

Web server code — `getServerEnv().API_URL`. Never import `env.server.ts` from client code.

## Modes

The mode is `NODE_ENV`: `development` (default), `test` (set by Vitest) or `production`.

|                      | Development (`pnpm dev`)                                                 | Production (`pnpm start`)                                   |
| -------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Configuration source | Real environment variables, then `apps/<app>/.env`, then the root `.env` | Real environment variables only; `.env` files are ignored   |
| Missing variables    | Local defaults that match `compose.yaml`                                 | Required variables must be set, otherwise the app exits     |
| Code                 | Watch mode (Nest, Vite)                                                  | Built output (`pnpm start` builds first)                    |
| Outbox schema        | Created at startup                                                       | Applied by `pnpm db:migrate`; startup fails if it is behind |

An invalid environment prints every problem at once and exits with code 1:

```
Invalid environment configuration:
  - PORT: Too big: expected number to be <=65535
  - DATABASE_URL: is required in production
```

Run the production build locally:

```bash
# bash
DATABASE_URL=postgres://flower:flower@localhost:5433/flower API_URL=http://localhost:3001 pnpm start
```

```powershell
# PowerShell
$env:DATABASE_URL="postgres://flower:flower@localhost:5433/flower"; $env:API_URL="http://localhost:3001"; pnpm start
```

## Variables

| Variable            | App                | Default (outside production)                     | Production                    | Purpose                                                                                  |
| ------------------- | ------------------ | ------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `NODE_ENV`          | api, web           | `development`                                    | `production` (set by `start`) | Mode, see above                                                                          |
| `PORT`              | api                | `3001`                                           | optional                      | HTTP port of the API                                                                     |
| `DATABASE_URL`      | api                | `postgres://flower:flower@localhost:5433/flower` | **required**                  | PostgreSQL connection string (also used by drizzle-kit)                                  |
| `DATABASE_POOL_MAX` | api                | `10`                                             | optional (1–100)              | Maximum connections in the pool                                                          |
| `OUTBOX_RELAY`      | api                | `on`                                             | `off` on API-only instances   | `on`: this process publishes outbox messages; `off`: only adds them (a worker publishes) |
| `API_URL`           | web                | `http://localhost:3001`                          | **required**                  | API base URL used by server functions                                                    |
| `PORT`              | web (built server) | `3000`                                           | optional                      | HTTP port of the built web server                                                        |

An empty value (`FOO=` in `.env`) counts as not set.

## How it works

- **API.** `AppConfigModule` (global) wraps `@nestjs/config` with `validate: parseEnv`, so validation runs when the module is created. `AppConfigService` is `ConfigService<Env, true>`: `get(…, { infer: true })` returns the parsed type, not `string | undefined`.
- **Startup errors.** Entry points create the app with `abortOnError: false` and the startup logger without the `error` level; `runOrExit()` in [`bootstrap.ts`](../../../apps/api/src/bootstrap.ts) prints the message once and exits. Without this Nest logs the validation message buried in a long stack trace.
- **Web.** The Nitro plugin `validate-env.ts`, registered in `vite.config.ts`, calls `getServerEnv()` when the server starts. Without it the environment would be checked only on the first request.

## Rules

- Code never reads `process.env` directly. oxlint `node/no-process-env` enforces it everywhere except `src/config/**`.
- Every variable has a schema entry; required-in-production values are checked in `superRefine`.
- No secrets in `.env.example` or in the repository.

## Adding a variable

1. Declare it in the app's schema (`env.schema.ts` or `env.server.ts`), with a development default if it has one.
2. Add it to [turbo.json](../../../turbo.json) → `passThroughEnv` for `dev` and `start`.
3. Add it to the table above and, if it has a local default, to [.env.example](../../../.env.example).
4. Cover new validation rules in `env.schema.spec.ts`.
