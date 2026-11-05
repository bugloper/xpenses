# Xpenses authentication & multi-user contract

Xpenses is multi-user with **fully isolated data per user**: every account, category,
transaction, budget, recurring rule and setting belongs to
exactly one user. There is one `admin` role (the instance owner) and the `user` role.

## Sessions

- Cookie `xpenses_session`: random 256-bit token; only its SHA-256 is stored. Flags:
  `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` when the request is HTTPS (direct TLS or
  `X-Forwarded-Proto: https` from a trusted proxy) or `XPENSES_SECURE_COOKIES=true`.
- Idle timeout 30 days (sliding, refreshed at most every 5 minutes), absolute lifetime 180 days.
- Passwords: Argon2id (t=3, m=64 MiB, p=1, 16-byte salt), minimum 10 characters, maximum 200.
- Login throttling: after 10 failed attempts for an email **or** 30 for an IP within 15 minutes →
  `429 too_many_attempts` with `Retry-After` seconds. Attempts for the email are cleared on a
  successful login. The per-email counter is deliberately a lockout: anyone who knows an email can
  keep its owner out for 15 minutes (accepted; it is the price of stopping online guessing).
- Client IP: with `XPENSES_TRUSTED_PROXY=true` the IP is the **last** entry of `X-Forwarded-For`
  (the one appended by the single proxy hop in front); earlier entries are client-supplied and
  ignored. Without it `X-Forwarded-For` is ignored entirely. Never set it unless exactly one proxy
  you control sits in front, or clients can forge their IP for the throttle.
- Login, register, setup and password-change bodies are capped at 16 KB (`400` beyond that).
- Signing in while a session cookie is already present revokes that previous session: a browser
  holds at most one live session, and switching users never leaves the earlier user's session alive.
- **CSRF**: every mutating request (POST/PATCH/PUT/DELETE) must carry the header
  `X-Xpenses-Client: web` (or any value). Missing header → `403 csrf_rejected`. If an `Origin`
  header is present it must match the request host (or `XPENSES_CORS_ORIGIN`) → else `403 csrf_rejected`;
  on an HTTPS request (direct TLS or `X-Forwarded-Proto: https` from the trusted proxy) an `http://`
  origin is rejected too. `XPENSES_CORS_ORIGIN=` (explicitly empty) disables the dev origin; the
  production compose/Dockerfile set it that way.
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

Emails are trimmed and lower-cased, then must be a bare address (no display name, comments,
quoting or whitespace), at most 254 bytes, with a dotted domain (`a@b` is rejected). `409 email_taken`
is only reachable once the caller holds a valid invite or registration is open, so a closed instance
never confirms which emails exist; login always answers `401 invalid_credentials` for unknown and
wrong-password alike (`403 account_disabled` requires the correct password first). An invite is
single-use even under concurrent registrations (the first commit wins, the rest get `invalid_invite`),
and `/auth/setup` can only ever create one owner however many requests race for it. With registration
open, anyone can create accounts (each costing one Argon2id hash); keep it closed and use invites
unless you accept that.
| POST | /auth/login | `{email, password}` → 200 `{data: User}` + cookie | 401 `invalid_credentials`, 403 `account_disabled`, 403 `setup_required`, 429 `too_many_attempts` |
| POST | /auth/reset-password | `{token, new_password}` → 204; the user's sessions are all revoked. The token comes from an admin-issued reset link (below); the server sends no email | 400 `invalid_reset` (bad, expired or already used), 422 validation |

## Authenticated routes

| Method | Path | Body → Result |
|---|---|---|
| GET | /auth/me | `{data: User}` (401 when not logged in) |
| PATCH | /auth/me | `{name?}` → User |
| PUT | /auth/me/avatar | multipart `file`: one JPEG/PNG/WebP (sniffed, ≤ XPENSES_MAX_UPLOAD_BYTES); stored as a 256×256 JPEG → User with `avatar_updated_at` set. 422 for other files |
| GET | /auth/me/avatar | the picture, `image/jpeg`, `Cache-Control: private` (append `?v=<avatar_updated_at>` to bust the cache); 404 when there is none |
| DELETE | /auth/me/avatar | → User with `avatar_updated_at: null` |
| PATCH | /auth/password | `{current_password, new_password}` → 204; every *other* session is revoked. 401 `invalid_credentials` if current is wrong |
| POST | /auth/logout | → 204, clears cookie |
| POST | /auth/logout-all | → 204, revokes all sessions incl. current |
| GET | /auth/sessions | `[{id, created_at, last_seen_at, user_agent, current: boolean}]` |
| DELETE | /auth/sessions/:id | → 204 |

Every existing data endpoint (`/accounts`, `/categories`, `/transactions`, `/budgets`, `/recurring`,
`/settings`, `/reports`) keeps its shape and is now scoped to the
logged-in user. Resources of another user return `404 not_found`. A new user starts with the
default categories (seeded at registration, fresh ids) and no accounts.

`GET /backup` and `POST /restore` are **admin only** (they snapshot/restore the whole instance).
A restore replaces `users` and `sessions` too: the `200` is sent, then the restoring admin's session
only survives if it existed in the snapshot, so the client must expect a `401` and sign in again.
Prefer the `X-Backup-Passphrase` header over `?passphrase=`; the app never logs query strings but a
reverse proxy's access log may.

## Admin routes (role `admin`)

| Method | Path | Body → Result |
|---|---|---|
| GET | /admin/users | `[User & {account_count: number, transaction_count: number}]` |
| PATCH | /admin/users/:id | `{is_active?, role?}` → User. 422 when targeting yourself (cannot disable/demote the last admin or self). Disabling revokes the user's sessions |
| DELETE | /admin/users/:id | → 204. Deletes the user **and all their data**; 422 for self |
| POST | /admin/users/:id/password-reset | → 201 `{id, user_id, expires_at, token, reset_path: "/reset-password?token=<token>"}` — a single-use link valid 24 h, shown **once**; the admin passes it to the user ("Forgot password?" on the sign-in page explains this) |
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
- Send `X-Xpenses-Client: web` on every request. Handle `403 csrf_rejected` as a bug (toast).
- **Logout / user switch on a shared device must not leak data**: on logout clear the persisted
  TanStack Query cache, the TanStack in-memory cache, the Workbox runtime cache (`caches.delete('xpenses-api')`),
  and `localStorage` UI prefs that reference ids (last account/category). The offline queue stores
  `user_id` on each item; the sync manager only drains items whose `user_id` matches the current user,
  other users' items stay untouched and hidden. On logout with pending items, warn and offer
  "sync now" / "log out anyway" (items are kept, not discarded). A queued POST that gets `401` is not
  marked failed; it stays pending with "sign in to sync".
- Settings gains: Profile (name, email read-only), Change password, Sessions (list + revoke), Log out,
  Log out everywhere. Admin-only section: Users (list, enable/disable, promote, delete with confirmation),
  Registration toggle, Invites (create → copy link, list, revoke). Backup/Restore rows only for admin.
- Header/More sheet shows the signed-in user and a Log out action.
