---
title: Taxonomies and taxons
module: catalog
kind: reference
audience: [developer]
---

# Taxonomies and taxons

Category trees of the catalog. Issue: [#35](https://github.com/DevAgassi/flower-network/issues/35).

## Data

- **`taxonomies`** — independent trees: "Category", "Occasion", more without code changes. `name`, `slug` (unique among not deleted), `position`, timestamps, `deleted_at`.
- **`taxons`** — nodes: `taxonomy_id`, `parent_id` (null at the top), `name`, `slug`, `path` (`ltree`), `position` (order among siblings), timestamps, `deleted_at`.
- **`product_taxons`** — links: `product_id`, `taxon_id`, `position` (manual order of products inside the taxon; new links go last). A product can be in any number of taxons in any taxonomies.

## Paths on `ltree`

Every taxon stores the slugs from the top: `flowers.roses.ecuador` (init.md §4.2). The extension is enabled in migration `0000`; Drizzle maps the column through a small `customType`.

```sql
-- everything under Flowers, one indexed query, no recursion
select * from taxons where taxonomy_id = $1 and path <@ 'flowers';
```

- A GiST index (`taxons_path_gist`) serves `<@`.
- Paths are unique **per taxonomy** among not deleted taxons (`taxons_path_unique`), which also makes slugs unique among siblings. Two taxonomies may both have `roses`.
- Slugs are lowercase `a-z 0-9` with single hyphens — valid `ltree` labels since PostgreSQL 16.

### Move and rename

Changing a taxon's `slug` or `parentId` rewrites the paths of its whole subtree in one transaction:

```sql
update taxons set path = case
  when nlevel(path) = nlevel(:old) then :new          -- the taxon itself
  else :new || subpath(path, nlevel(:old))            -- its descendants
end
where taxonomy_id = :t and deleted_at is null and path <@ :old;
```

The `CASE` is needed: `subpath`/`subltree` with an empty remainder fails with `invalid positions` ([journal](journal.md)). Moving a taxon into itself or its own subtree answers `400`; a slug already used by a sibling answers `409`.

### Delete

`DELETE /taxons/:id` soft-deletes the taxon and its subtree; `DELETE /taxonomies/:id` soft-deletes the taxonomy and all its taxons. Product links to deleted taxons are removed — links are not history. The freed slugs can be used again.

## API

| Endpoint                      | Permission       | Response                                        |
| ----------------------------- | ---------------- | ----------------------------------------------- |
| `GET /taxonomies`             | session          | `200 Taxonomy[]`                                |
| `POST /taxonomies`            | `catalog:manage` | `201`; `409` slug taken                         |
| `PATCH /taxonomies/:id`       | `catalog:manage` | `200`; `404`, `409`                             |
| `DELETE /taxonomies/:id`      | `catalog:manage` | `204`                                           |
| `GET /taxonomies/:id/taxons`  | session          | `200 Taxon[]`, the whole tree depth-first       |
| `POST /taxonomies/:id/taxons` | `catalog:manage` | `201`; `400` unknown parent, `409` sibling slug |
| `PATCH /taxons/:id`           | `catalog:manage` | `200`; `400` move into own subtree, `409`       |
| `DELETE /taxons/:id`          | `catalog:manage` | `204`                                           |
| `PUT /products/:id/taxons`    | `catalog:manage` | `200 Product`; `400` unknown taxon              |
| `GET /products?taxonId=…`     | session          | products in the taxon **or any descendant**     |

`Taxon` = `{ id, taxonomyId, parentId, name, slug, path, depth, position }`. The tree comes as a flat list in depth-first order (each parent before its children, siblings by `position`, then name); the UI nests it by `parentId`. A flat list keeps the contract free of recursive schemas.

## Not yet

Reordering products inside a taxon and storefront category pages (ADM-02, STF-01), taxon images and SEO texts, translated names (PLT-16), seed taxonomies (PLT-08).
