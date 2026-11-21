---
title: Sign-in and sessions
module: identity
kind: reference
audience: [developer]
---

# Sign-in and sessions

Staff sign in with email and password and get an opaque session token. Every request then sends `Authorization: Bearer <token>`; a global guard turns it into `request.user`. Issue: [#31](https://github.com/DevAgassi/flower-network/issues/31).

## API

| Endpoint                                 | Auth    | Response                                              |
| ---------------------------------------- | ------- | ----------------------------------------------------- |
| `POST /auth/login` `{ email, password }` | public  | `201 { token, expiresAt, user }`; `400`, `401`, `429` |
| `POST /auth/logout`                      | session | `204`                                                 |
| `GET /auth/me`                           | session | `200 { id, email, name }`; `401`                      |

```ts
import { createApiClient } from '@flower/api-client';

const api = createApiClient(API_URL);
const { data } = await api.POST('/auth/login', { body: { email, password } });

const authed = createApiClient(API_URL, {
  headers: { Authorization: `Bearer ${data.token}` },
});
const { data: me } = await authed.GET('/auth/me');
```

The browser never calls the API directly: TanStack Start server functions do, and keep the token in an httpOnly cookie on the web domain (ADM-01). No ambient cookie on the API means no CSRF exposure there; the POS and a mobile app use the same bearer scheme.

## Protecting routes

`AuthGuard` is registered globally (`APP_GUARD` in `IdentityModule`): **every route requires a session** unless marked public.

```ts
@Public()               // on a controller or a single route: no session needed
@Controller('health')
export class HealthController { … }

@ApiBearerAuth()        // documents the requirement in openapi.json
@Get('me')
me(@CurrentUser() user: AuthenticatedUser) { … }   // the signed-in user
```

- Public today: `GET /health`, `GET /metrics`, `POST /auth/login`, and `/docs` (served outside Nest's router).
- The guard also rejects a valid session whose user is disabled or deleted.
- `openapi.spec.ts` fails when an operation has no bearer requirement and is not in its list of public operations — a forgotten `@ApiBearerAuth()` is caught by CI.
- Permissions per role come with IAM-02; until then every signed-in staff user can call every protected route.

## Users

Table `users` (module `identity`): `id` (UUIDv7), `email` (unique, stored lowercased — a check constraint enforces it), `name`, `password_hash`, `status` (`active` / `disabled`), `public_metadata` / `private_metadata` (`jsonb`, init.md §4.1), `last_login_at`, `created_at`, `updated_at`. All access goes through `UsersService`.

## Passwords

`scrypt` from `node:crypto` with OWASP parameters (N = 2^17, r = 8, p = 1, 16-byte salt, 32-byte key), stored as `scrypt$N$r$p$<salt>$<hash>`. Passwords are NFKC-normalised before hashing, so the same text typed on different keyboards matches. Verification is constant-time.

Why not Argon2id: `crypto.argon2` exists since Node 24.7 but is still experimental. Because each hash carries its algorithm and parameters, switching later is a rehash at the next successful login.

## Sessions

- Token: 32 random bytes, base64url. Redis stores only its SHA-256: `session:<sha256>` → `{ userId, createdAt }`.
- **Idle timeout 12 h** (TTL on the key, extended by every request) and **absolute lifetime 7 days** (checked against `createdAt`).
- `user-sessions:<userId>` lists a user's session hashes, so `UsersService.setStatus(id, 'disabled')` ends all of them at once.
- Logout deletes the session; a deleted or expired session answers `401 Sign in required`.

## Login limits

- 5 failed logins for an email, or 20 from an IP, within 15 minutes → `429` until the window (started by the first failure) passes — even with the right password.
- A successful login resets the email's counter. Email counters use a SHA-256 of the email as key: no personal data in key names.
- Unknown email, wrong password and disabled user all answer the same `401 Invalid email or password` after the same amount of hashing work, so emails cannot be discovered.
- `request.ip` is the client address; behind a reverse proxy, Express's `trust proxy` must be set when deploying (PLT-10).

## Creating users

Until the admin screens exist (ADM-01):

```bash
pnpm --filter @flower/api user:create --email owner@example.com --name "Owner Name"
# Created owner@example.com (01a1fe79-…).
# Password (shown once): …
```

The password is generated and printed once; it is not stored anywhere in plain text. Uses the database and Redis from the environment (`DATABASE_URL`, `REDIS_URL`).

## Rules

- Never log tokens, passwords or password hashes.
- Other modules identify the user only through `@CurrentUser()` / `request.user`; they never read sessions or the `users` table.
- New routes are protected automatically; add `@ApiBearerAuth()` so the contract says so, or `@Public()` (and the openapi test list) when a route must be open.
