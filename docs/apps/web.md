---
title: Web
module: apps
kind: reference
audience: [developer]
---

# Web (`apps/web`)

TanStack Start 1 on Vite with Nitro 3 as the server: the storefront, the admin panel (`/admin`) and the florist POS (`/pos`) in one app. Tailwind CSS 4, shadcn/ui components, TanStack Query, Router and Table.

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

Server functions (`createServerFn`) call the API with `getServerEnv().API_URL`, so the API address never reaches the browser bundle. The home page ([`routes/index.tsx`](../../apps/web/src/routes/index.tsx)) shows the API health this way. A typed client generated from OpenAPI replaces hand-written fetches in PLT-06.

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
