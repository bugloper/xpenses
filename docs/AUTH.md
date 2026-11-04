# Xpensiv authentication & multi-user contract

Xpensiv is multi-user with **fully isolated data per user**: every account, category,
transaction, budget, recurring rule, statement, reconciliation and setting belongs to
exactly one user. There is one `admin` role (the instance owner) and the `user` role.

## Sessions

- Cookie `xpensiv_session`: random 256-bit token; only its SHA-256 is stored. Flags:
  `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` when the request is HTTPS (direct TLS or
  `X-Forwarded-Proto: https` from a trusted proxy) or `XPENSIV_SECURE_COOKIES=true`.
- Idle timeout 30 days (sliding, refreshed at most every 5 minutes), absolute lifetime 180 days.
- Passwords: Argon2id (t=3, m=64 MiB, p=1, 16-byte salt), minimum 10 characters, maximum 200.
- Login throttling: after 10 failed attempts for an email **or** 30 for an IP within 15 minutes →
  `429 too_many_attempts` with `Retry-After` seconds.
- **CSRF**: every mutating request (POST/PATCH/PUT/DELETE) must carry the header
  `X-Xpensiv-Client: web` (or any value). Missing header → `403 csrf_rejected`. If an `Origin`
  header is present it must match the request host (or `XPENSIV_CORS_ORIGIN`) → else `403 csrf_rejected`.
  Browsers cannot add custom headers cross-site without a CORS preflight, so together with
  `SameSite=Strict` this blocks CSRF without a token dance.
- Unauthenticated access to anything except the public auth routes and `/health` → `401 unauthenticated`.
  Non-admin access to `/admin/*` or `/backup`/`/restore` → `403 forbidden`.
  A disabled user's requests → `403 account_disabled` (sessions are revoked on disable).

```ts
type User = { id: string; name: string; email: string; role: "admin" | "user"; is_active: boolean;
              created_at: string; last_login_at: string | null }
```

## Public auth routes (`/api/v1`)

| Method | Path | Body → Result | Errors |
|---|---|---|---|
| GET | /auth/status | → `{setup_required: boolean, registration_open: boolean, authenticated: boolean}` | — |
| POST | /auth/setup | `{name, email, password}` → 201 `{data: User}` + session cookie. Creates the **first** user as `admin`. | 409 `already_set_up` |
| POST | /auth/register | `{name, email, password, invite_token?}` → 201 `{data: User}` + cookie | 403 `registration_closed` (no invite and registration off), 400 `invalid_invite` (bad/expired/used), 409 `email_taken`, 422 validation |
| POST | /auth/login | `{email, password}` → 200 `{data: User}` + cookie | 401 `invalid_credentials`, 403 `account_disabled`, 403 `setup_required`, 429 `too_many_attempts` |

## Authenticated routes

| Method | Path | Body → Result |
|---|---|---|
| GET | /auth/me | `{data: User}` (401 when not logged in) |
| PATCH | /auth/me | `{name?}` → User |
| PATCH | /auth/password | `{current_password, new_password}` → 204; every *other* session is revoked. 401 `invalid_credentials` if current is wrong |
| POST | /auth/logout | → 204, clears cookie |
| POST | /auth/logout-all | → 204, revokes all sessions incl. current |
| GET | /auth/sessions | `[{id, created_at, last_seen_at, user_agent, current: boolean}]` |
| DELETE | /auth/sessions/:id | → 204 |

Every existing data endpoint (`/accounts`, `/categories`, `/transactions`, `/budgets`, `/recurring`,
`/settings`, `/statements`, `/reconciliation`, `/reports`) keeps its shape and is now scoped to the
logged-in user. Resources of another user return `404 not_found`. A new user starts with the
default categories (seeded at registration, fresh ids) and no accounts.

`GET /backup` and `POST /restore` are **admin only** (they snapshot/restore the whole instance).

## Admin routes (role `admin`)

| Method | Path | Body → Result |
|---|---|---|
| GET | /admin/users | `[User & {account_count: number, transaction_count: number}]` |
| PATCH | /admin/users/:id | `{is_active?, role?}` → User. 422 when targeting yourself (cannot disable/demote the last admin or self). Disabling revokes the user's sessions |
| DELETE | /admin/users/:id | → 204. Deletes the user **and all their data**; 422 for self |
| GET | /admin/settings | `{registration_open: boolean}` |
| PATCH | /admin/settings | `{registration_open}` → same |
| POST | /admin/invites | `{email?, expires_in_hours?}` (default 72, max 720) → 201 `{id, token, email, expires_at, register_path: "/register?invite=<token>"}` — the token is shown **once** |
| GET | /admin/invites | `[{id, email, created_at, expires_at, used_at, used_by_email}]` |
| DELETE | /admin/invites/:id | → 204 |

## Frontend requirements

- Routes: `/setup` (only while `setup_required`), `/login` (`?redirect=` back to the intended page),
  `/register` (`?invite=` token; reachable when registration is open or an invite is present).
  Every other route requires a session: the root route's `beforeLoad` resolves `/auth/status` +
  `/auth/me`, redirects to `/setup` or `/login` as needed. A `401` from any request logs the user out
  client-side and redirects to `/login`.
- Send `X-Xpensiv-Client: web` on every request. Handle `403 csrf_rejected` as a bug (toast).
- **Logout / user switch on a shared device must not leak data**: on logout clear the persisted
  TanStack Query cache, the TanStack in-memory cache, the Workbox runtime cache (`caches.delete('xpensiv-api')`),
  and `localStorage` UI prefs that reference ids (last account/category). The offline queue stores
  `user_id` on each item; the sync manager only drains items whose `user_id` matches the current user,
  other users' items stay untouched and hidden. On logout with pending items, warn and offer
  "sync now" / "log out anyway" (items are kept, not discarded). A queued POST that gets `401` is not
  marked failed; it stays pending with "sign in to sync".
- Settings gains: Profile (name, email read-only), Change password, Sessions (list + revoke), Log out,
  Log out everywhere. Admin-only section: Users (list, enable/disable, promote, delete with confirmation),
  Registration toggle, Invites (create → copy link, list, revoke). Backup/Restore rows only for admin.
- Header/More sheet shows the signed-in user and a Log out action.
