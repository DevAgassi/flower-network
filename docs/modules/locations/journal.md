---
title: Locations journal
module: locations
kind: journal
audience: [developer]
---

# Locations journal

Problems we hit, why they happened and how we solved them. Newest first. Entries are not rewritten when the code changes later.

### An optional query parameter was documented as required

- **When:** 2026-11-21 · LOC-01 (#33)
- **Symptom:** `GET /locations?includeArchived` appeared in `openapi.json` with `"required": true`, so the generated client would demand it on every call — even with `.optional()` or `.default()` on the zod schema.
- **Cause:** `@nestjs/swagger` builds a parameter from `@Query('name', { schema })` but does not read optionality from a Standard Schema.
- **Fix:** an explicit `@ApiQuery({ name, required: false, … })` next to the schema in [`locations.controller.ts`](../../../apps/api/src/locations/locations.controller.ts); the schema still validates.
- **Lesson:** after adding a query parameter, check its `required` flag in the `openapi.json` diff.
