---
title: Roles, permissions and locations
module: identity
kind: reference
audience: [developer]
---

# Roles, permissions and locations

Every staff user has one **role**. A role gives a set of **permissions**; routes require permissions, never roles. Florists and couriers are also bound to **locations** and may work only there. Issue: [#32](https://github.com/DevAgassi/flower-network/issues/32).

## Roles

| Role      | Who                                                        | Locations              |
| --------- | ---------------------------------------------------------- | ---------------------- |
| `owner`   | Owner of the network; can do everything, manages admins    | all                    |
| `admin`   | Runs the network day to day; manages florists and couriers | all                    |
| `florist` | Works at a shop: sales, bouquets, stock operations         | from `staff_locations` |
| `courier` | Delivers orders                                            | from `staff_locations` |

Stored as `users.role` (`staff_role` enum). Customers are not staff and have no role here: they sign in by phone with an optional account (ADR-3, IAM-03).

## Permission matrix

Defined in one place, [`permissions.ts`](../../../apps/api/src/identity/permissions.ts):

| Permission     | owner | admin                          | florist | courier |
| -------------- | ----- | ------------------------------ | ------- | ------- |
| `staff:read`   | ✓     | ✓                              | –       | –       |
| `staff:manage` | ✓     | ✓ (florists and couriers only) | –       | –       |

The owner always has every permission.

### Adding a permission

When a module needs one (e.g. `inventory:write-off`):

1. Add it to `PERMISSIONS` as `<area>:<action>`.
2. Add it to the roles that get it in `ROLE_PERMISSIONS`.
3. Protect the route with `@RequirePermission('inventory:write-off')`.
4. Add a row to the matrix above and to the role guides of that module.

`Permission` is a union type, so a misspelt permission does not compile.

## Protecting a route

```ts
@Get()
@RequirePermission('staff:read')   // 403 for roles without it
list() { … }
```

`@RequirePermission()` also adds `@ApiBearerAuth()`, the `401` and `403` responses and `x-required-permission` to `openapi.json`; `openapi.spec.ts` checks that every such operation documents `403`. A route without it only needs a session.

The guard reads the role and locations from the database on every request, so a role change, a new location or disabling applies to the very next request — no re-login.

## Location scope

`request.user.locations` (from `@CurrentUser()`) is `'all'` for owner and admin, or the location ids of a florist or courier. Anything that belongs to a location (stock, cash shift, shipment) is checked with [`location-scope.ts`](../../../apps/api/src/identity/location-scope.ts):

```ts
assertLocationAccess(user, stock.locationId); // 403 "No access to this location"
if (user.locations !== 'all')
  query.where(inArray(t.locationId, [...user.locations]));
```

A florist with no locations yet sees nothing location-bound. `staff_locations.location_id` has no foreign key until the `locations` table exists; LOC-01 adds it and validates ids in the staff API ([#33](https://github.com/DevAgassi/flower-network/issues/33)).

## Staff API

| Endpoint                   | Permission     | Response                                                |
| -------------------------- | -------------- | ------------------------------------------------------- |
| `GET /staff`               | `staff:read`   | `200 StaffMember[]`                                     |
| `GET /staff/:id`           | `staff:read`   | `200 StaffMember`, `404`                                |
| `POST /staff`              | `staff:manage` | `201 { member, password }`, `409` email taken           |
| `PATCH /staff/:id`         | `staff:manage` | `200 StaffMember`, `404`, `409` last owner              |
| `POST /staff/:id/password` | `staff:manage` | `200 { password }`; all sessions of that user end       |
| `GET /auth/me`             | session        | `200 { id, email, name, role, permissions, locations }` |

Passwords are generated (16 URL-safe characters) and returned once; nobody chooses another user's password.

### Rules

- An admin creates, changes, disables and resets passwords only of florists and couriers; the owner manages everyone.
- Nobody changes their own role or status, or resets their own password through `/staff`.
- `locationIds` are only for florists and couriers (`400` otherwise); a user moved to owner or admin loses their bindings.
- There is always at least one active owner. All active owners are locked in id order before the change, so two owners demoting each other at the same time end with one owner and a `409` for the second request.
- Changes are logged with user ids only (who changed whom, which fields).
