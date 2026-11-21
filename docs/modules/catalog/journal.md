---
title: Catalog journal
module: catalog
kind: journal
audience: [developer]
---

# Catalog journal

Problems we hit, why they happened and how we solved them. Newest first. Entries are not rewritten when the code changes later.

### Moving a taxon failed with "invalid positions"

- **When:** 2026-11-21 · CAT-02 (#35)
- **Symptom:** `PATCH /taxons/:id` with a new slug or parent answered `500`; PostgreSQL: `invalid positions`.
- **Cause:** the subtree update built each path as `new || subltree(path, nlevel(old), nlevel(path))`. For the moved taxon itself the remainder is empty (`start = end`), and `subltree`/`subpath` reject an empty range instead of returning an empty path.
- **Fix:** a `CASE` in [`taxonomy.service.ts`](../../../apps/api/src/catalog/taxonomy.service.ts): the taxon itself gets the new path, descendants get `new || subpath(path, nlevel(old))`.
- **Lesson:** `ltree` functions do not accept empty ranges; test path rewrites on the node itself, not only on its descendants.
