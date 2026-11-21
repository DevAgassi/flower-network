---
title: Identity journal
module: identity
kind: journal
audience: [developer]
---

# Identity journal

Problems we hit, why they happened and how we solved them. Newest first. Entries are not rewritten when the code changes later.

### Two owners demoting each other could deadlock instead of getting 409

- **When:** 2026-11-21 · IAM-02 (#32)
- **Symptom:** found in review before the e2e test ran: the "keep one active owner" check locked the target row, then all active owners. Two concurrent requests (owner A demotes B, B demotes A) each hold their own row and wait for the other's — PostgreSQL aborts one with a deadlock error (`40P01`, a `500`), not the intended `409`.
- **Cause:** the same rows were locked in a different order by the two transactions.
- **Fix:** [`UsersService.update`](../../../apps/api/src/identity/users.service.ts) locks all active owners **ordered by id first**, then the target row. The second transaction waits, then re-reads the owners (PostgreSQL re-checks the `WHERE` of locked rows after the wait), sees one owner left and answers `409`. Covered by the concurrent test in `staff.e2e-spec.ts`.
- **Lesson:** when a transaction locks several rows, lock them in one global order (e.g. by id), before any row-specific lock.

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
