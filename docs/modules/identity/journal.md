---
title: Identity journal
module: identity
kind: journal
audience: [developer]
---

# Identity journal

Problems we hit, why they happened and how we solved them. Newest first. Entries are not rewritten when the code changes later.

### The OpenAPI document called our session token a JWT

- **When:** 2026-11-21 · IAM-01 (#31)
- **Symptom:** the generated `securitySchemes.bearer` had `"bearerFormat": "JWT"`.
- **Cause:** `DocumentBuilder.addBearerAuth()` fills in `bearerFormat: 'JWT'` when none is given.
- **Fix:** `bearerFormat: 'opaque'` in [`openapi.ts`](../../../apps/api/src/openapi/openapi.ts).
- **Lesson:** read the generated `openapi.json` diff — defaults of the generator end up in the published contract.

### Adding `request.user` to Express types failed

- **When:** 2026-11-21 · IAM-01 (#31)
- **Symptom:** `declare module 'express-serve-static-core'` → `TS2664: Invalid module name in augmentation`.
- **Cause:** with pnpm only direct dependencies are resolvable; `express-serve-static-core` is a dependency of `@types/express`, not of the API.
- **Fix:** augment the global `Express.Request` namespace instead ([`authenticated-user.ts`](../../../apps/api/src/identity/authenticated-user.ts)), which Express merges into its `Request`.
- **Lesson:** in a pnpm workspace, augment types through a global namespace or a package the app depends on directly.
