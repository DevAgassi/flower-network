---
title: Stores and warehouses
module: locations
kind: reference
audience: [developer]
---

# Stores and warehouses

Issue: [#33](https://github.com/DevAgassi/flower-network/issues/33).

## Data

**`locations`** — `id` (UUIDv7), `name` (unique, case-insensitive), `kind` (`store` / `warehouse`), `status` (`active` / `archived`), `address`, `latitude` / `longitude` (`double precision`, WGS 84), `phone`, `created_at`, `updated_at`.

The database enforces: latitude in −90…90, longitude in −180…180, both or neither, and a **store always has coordinates** (map, delivery radius). A warehouse may have none.

**`location_hours`** — weekly opening hours: `location_id`, `weekday` (ISO, 1 = Monday … 7 = Sunday), `opens_at`, `closes_at` (`time`), primary key `(location_id, weekday)`, check `opens_at < closes_at`.

- Times are **Europe/Kyiv local time** (init.md §4.1); no time zone is stored.
- One interval per day. A weekday without a row is a day off.
- `00:00–24:00` is open around the clock: PostgreSQL `time` accepts `24:00`. Intervals past midnight are not supported.

### Never deleted

A location is referenced by history (stock movements, orders, cash shifts), so there is no delete. `status: archived` hides it from `GET /locations` and from new bindings; existing references stay valid.

## API

| Endpoint               | Permission         | Response                                                         |
| ---------------------- | ------------------ | ---------------------------------------------------------------- |
| `GET /locations`       | session            | `200 Location[]`, stores first, by name; `?includeArchived=true` |
| `GET /locations/:id`   | session            | `200 Location`, `404`                                            |
| `POST /locations`      | `locations:manage` | `201 Location`; `400`, `409` name taken                          |
| `PATCH /locations/:id` | `locations:manage` | `200 Location`; `400`, `404`, `409`                              |

```json
{
  "name": "Podil",
  "kind": "store",
  "address": "Kontraktova sq. 1, Kyiv",
  "latitude": 50.465,
  "longitude": 30.515,
  "phone": "+380 44 123 45 67",
  "hours": [
    { "weekday": 1, "opens": "08:30", "closes": "21:00" },
    { "weekday": 7, "opens": "00:00", "closes": "24:00" }
  ]
}
```

- Every staff member reads locations (a florist chooses the destination of a transfer); owner and admin manage them ([roles](../identity/roles.md#permission-matrix)).
- `PATCH` with `hours` replaces the whole week; `latitude: null, longitude: null` clears coordinates (warehouses only).
- Validation: `HH:MM` times (`closes` may be `24:00`), `opens < closes`, each weekday at most once, coordinates in range, a store needs coordinates.

## For other modules

```ts
@Module({ imports: [LocationsModule] })
…
constructor(private readonly locations: LocationsService) {}

await this.locations.assertActive(locationIds); // 400 "Unknown or archived locations: …"
```

- `assertActive(ids)` — before binding anything to locations (staff, stock). Identity uses it for `POST/PATCH /staff`.
- `list()` / `get(id)` — read the directory; never query the tables directly.
- A foreign key to `locations.id` in your own `*.schema.ts` is allowed ([database conventions](../platform/database.md#conventions)); `staff_locations.location_id` has one.
- Who may work with which location is decided by identity: `assertLocationAccess(user, locationId)` ([location scope](../identity/roles.md#location-scope)).

## Not yet

Special dates (holidays, 14 February, 8 March), "open now" and pickup windows come with pickup and delivery slots (Stage 3); delivery zones with ADR-8.
