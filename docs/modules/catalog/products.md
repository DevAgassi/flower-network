---
title: Products and variants
module: catalog
kind: reference
audience: [developer]
---

# Products and variants

Issue: [#34](https://github.com/DevAgassi/flower-network/issues/34).

## Data

**`products`** — `id` (UUIDv7), `name`, `slug`, `description`, `status` (`draft` / `active`), `public_metadata`, `private_metadata`, `created_at`, `updated_at`, `deleted_at`.

**`product_variants`** — `id`, `product_id`, `sku`, `is_master`, `position`, `public_metadata`, `private_metadata`, `created_at`, `updated_at`, `deleted_at`.

| Rule                                                  | Enforced by                                                |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| Slug is lowercase `a-z 0-9` with single hyphens       | check constraint + contract                                |
| SKU is uppercase `A–Z 0–9 . _ -`, up to 64 characters | check constraint; the contract uppercases what it receives |
| Slug and SKU unique among **not deleted** rows        | partial unique indexes `WHERE deleted_at IS NULL`          |
| One master variant per product                        | partial unique index on `product_id WHERE is_master`       |

- `draft` products are being prepared and are not shown to customers; `active` ones are on sale.
- `public_metadata` is for the storefront and integrations, `private_metadata` for internal data (init.md §4.1). `PATCH` replaces the whole object.

## Master variant

Every product is created **with exactly one master variant** (in the same transaction; the SKU in `POST /products` is the master's).

```ts
sellableVariants(product.variants);
// no other variants → [master]          a vase
// with variants     → [50 cm, 60 cm]    the master is not sold
```

The API returns the result as `sellableVariantIds`. Stock, prices and carts must use this function instead of re-implementing the rule. Until option types arrive (CAT-03), variants differ only by SKU and position.

## Soft delete

`DELETE` sets `deleted_at` instead of removing rows (init.md §4.1): orders and stock movements keep pointing at them.

- Deleting a product deletes its variants too, in one transaction.
- The master is deleted only together with its product (`400` otherwise).
- Deleted rows disappear from the API (`404`), and their slug and SKU can be used again.

## API

| Endpoint                                   | Permission       | Response                               |
| ------------------------------------------ | ---------------- | -------------------------------------- |
| `GET /products`                            | session          | `200 { items, nextCursor }`            |
| `GET /products/:id`                        | session          | `200 Product`, `404`                   |
| `POST /products`                           | `catalog:manage` | `201 Product`; `409` slug or SKU taken |
| `PATCH /products/:id`                      | `catalog:manage` | `200 Product`; `404`, `409`            |
| `DELETE /products/:id`                     | `catalog:manage` | `204`                                  |
| `POST /products/:id/variants`              | `catalog:manage` | `201 Variant`; `409`                   |
| `PATCH /products/:id/variants/:variantId`  | `catalog:manage` | `200 Variant`; `404`, `409`            |
| `DELETE /products/:id/variants/:variantId` | `catalog:manage` | `204`; `400` for the master            |

- `GET /products` — newest first, [cursor pagination](../platform/api-contract.md#pagination) (`limit` 1–200, default 50; `cursor`), `status` filter, `q` searches names and SKUs (case-insensitive, `%` and `_` are literal), `taxonId` returns products in that taxon or any of its descendants ([taxonomies](taxonomies.md)).
- Every product carries `taxonIds`; `PUT /products/:id/taxons { taxonIds }` replaces them.
- Every staff member reads the catalog (florists sell from it); owner and admin manage it ([roles](../identity/roles.md#permission-matrix)).
- `409` comes from the pre-check with a readable message, or from the unique index when two requests race.

```json
POST /products
{ "name": "Ecuador rose", "slug": "ecuador-rose", "sku": "rose-ecu", "status": "draft" }
→ 201 { "id": "…", "variants": [{ "sku": "ROSE-ECU", "isMaster": true, … }], "sellableVariantIds": ["…"] }
```

## Not yet

Option types (CAT-03), prices (CAT-04), photos (CAT-05), bouquet recipes and `kit_type` (CAT-06), barcodes (POS), the public storefront API (STF-01).
