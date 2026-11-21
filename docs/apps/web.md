---
title: Web
module: apps
kind: reference
audience: [developer]
---

# Web (`apps/web`)

TanStack Start 1 on Vite with Nitro 3 as the server: the storefront. The admin panel and the florist POS (`/pos`) are a separate app, `apps/admin`, from ADM-01 ([ADR-14](../../init.md)), so the storefront and the admin deploy and fail independently. Tailwind CSS 4, shadcn/ui components, TanStack Query, Router and Table.

## Source layout

```
src/
  routes/                 file-based routes; routeTree.gen.ts is generated — do not edit
  integrations/           TanStack Query provider and devtools
  lib/                    helpers (cn() for class names)
  env.server.ts           server-only environment schema
  server-plugins/         Nitro plugins (validate-env.ts runs at server start)
  router.tsx              router setup
  styles.css              Tailwind entry
```

## Talking to the API

Server functions (`createServerFn`) call the API through the typed client from `@flower/api-client` with `getServerEnv().API_URL`, so the API address never reaches the browser bundle. Paths, bodies and responses are typed from the API's OpenAPI document; when the API changes a shape, the web stops type-checking until it is updated ([API contract](../modules/platform/api-contract.md)). The home page ([`routes/index.tsx`](../../apps/web/src/routes/index.tsx)) shows the API health this way.

## Rules

- URL search params are the single source of truth for catalog filters, pagination and the selected shop (init.md §8).
- `env.server.ts` is never imported from client code.
- Imports inside the app use the `#/` alias for `src/`.

## Scripts

| Script (`pnpm --filter @flower/web …`) | What it does                                  |
| -------------------------------------- | --------------------------------------------- |
| `dev`                                  | Vite dev server on port 3000                  |
| `build`                                | Builds to `.output/`                          |
| `start`                                | Runs `.output/server/index.mjs` in production |
| `lint` / `typecheck`                   | oxlint / tsc                                  |

Environment variables: [Configuration](../modules/platform/configuration.md#variables).
