# Xpensiv

Personal expense tracker.
Multi-user with fully isolated data, installable as a PWA, with offline expense entry.

- **Backend:** Go, Echo v4, SQLite (`modernc.org/sqlite`, no CGO), embedded SQL migrations.
- **Frontend:** React, TypeScript, Vite, TanStack Router/Query, Tailwind, shadcn/ui, Recharts, `vite-plugin-pwa`.
- **Money:** every amount is an integer in minor units (chhertum). No floats anywhere in the financial path.

## Features

- Expenses, income, transfers, refunds, adjustments; accounts (bank, cash, mobile wallet, credit card, savings) with ledger-calculated balances.
- Two-level categories: 12 expense and 4 income main categories with sub-categories seeded by default, your own on top; a compact picker with search and recently used chips; monthly budgets per category (a main category's budget covers its sub-categories) with 75/90/100% warnings.
- Recurring transactions (daily/weekly/monthly/yearly) generated as drafts or real entries, never duplicated.
- Reports (monthly, daily, weekly, category, merchant, income vs expense, accounts, budgets) with CSV and PDF export.
- PWA: installable, offline shell, offline transaction queue with sync indicator, update notifications.
- Backup/restore (optionally AES-256-GCM encrypted), admin only.
- Accounts: first-run owner setup, Argon2id passwords, cookie sessions, login throttling, invite-only or open registration, admin user management. Every user sees only their own data.

## First run and accounts

1. Open the app. With no users yet it shows **Set up Xpensiv**: create the owner account (you become the `admin`).
2. Registration is closed by default. To let someone else in, go to **Admin → Invites** and send them the one-time link, or switch **Registration** on for open sign-up.
3. Every user gets their own accounts, categories (defaults seeded on sign-up), transactions, budgets and settings. The admin can disable, promote or delete users (deleting a user deletes all their data) but cannot see their data.
4. Passwords are hashed with Argon2id. Sessions are HttpOnly, SameSite=Strict cookies (Secure over HTTPS), idle timeout 30 days, absolute 180 days. Ten failed logins per email (or thirty per IP) in 15 minutes pause sign-in. See `docs/AUTH.md` for the full contract.

## Development setup

Requirements: Go 1.26+, Bun 1.x.

```sh
cp .env.example .env            # optional; defaults work
cd web && bun install && cd ..
make dev                        # API on http://127.0.0.1:8080, UI on http://localhost:5173
```

`make dev` runs the Go API (`XPENSIV_STATIC_DIR=` so it serves only the API) and the Vite dev server, which proxies `/api` to the Go process.

Run them separately with `make dev-api` and `make dev-web`.

Data lives in `./data/` by default (`xpensiv.db`, backups under `backups/`). The directory and database file are created with `0700`/`0600` permissions.

## Tests

```sh
make test-api     # go test ./...   (unit + SQLite integration tests via httptest)
make test-web     # vitest + React Testing Library
make e2e          # Playwright: builds web/dist, starts the Go server on a throwaway DB, runs both device projects
make lint         # gofmt, go vet, eslint, tsc
```

The Playwright suite (`web/e2e/`) runs in real Chromium against the production build served by the Go
binary, at phone and desktop widths: sign-in/sign-out and redirects, user isolation, admin invites,
quick add, category creation, service worker registration and the offline app shell, the
"new version" update prompt, the install prompt, the offline transaction queue syncing exactly once,
keyboard navigation of the add sheet and dialogs, and an axe WCAG 2.1 AA scan of every screen
(serious/critical violations fail the run). First time: `cd web && bunx playwright install chromium`.

## Production build

```sh
make build        # builds web/dist and bin/xpensiv
./bin/xpensiv     # serves API + UI on http://127.0.0.1:8080
```

Configuration is via environment variables (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `XPENSIV_ADDR` | `127.0.0.1:8080` | Listen address |
| `XPENSIV_DATA_DIR` | `./data` | SQLite DB, backups |
| `XPENSIV_MAX_UPLOAD_BYTES` | `10485760` | Base size limit for uploads (a restore file may be 10× this) |
| `XPENSIV_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `XPENSIV_STATIC_DIR` | `./web/dist` | Built frontend to serve (empty = API only) |
| `XPENSIV_CORS_ORIGIN` | `http://localhost:5173` | Dev-server origin allowed for CORS (set empty in production) |
| `XPENSIV_DEFAULT_CURRENCY` | `BTN` | Currency for new accounts |
| `XPENSIV_SECURE_COOKIES` | `auto` | `auto` marks the session cookie Secure only over HTTPS; `true`/`false` force it |
| `XPENSIV_TRUSTED_PROXY` | `false` | `true` only behind your own reverse proxy: trusts `X-Forwarded-For`/`X-Forwarded-Proto` |

### Docker

```sh
docker compose up -d --build     # http://127.0.0.1:8080, data in the xpensiv-data volume
```

### Deploying on a server (HTTPS)

`docker-compose.prod.yml` adds a Caddy reverse proxy that obtains and renews a Let's Encrypt
certificate automatically. Point a DNS name at the server, then:

```sh
export XPENSIV_DOMAIN=xpensiv.example.com
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy terminates TLS on 80/443 and forwards to the app, which is not published on the host.
The app runs with `XPENSIV_TRUSTED_PROXY=true` (so login throttling sees real client IPs and
session cookies are marked Secure) and `XPENSIV_CORS_ORIGIN=` (same-origin only). The PWA, the
offline queue and the install prompt all require HTTPS, which this setup provides.

**No domain yet?** Use a [sslip.io](https://sslip.io) name for the server's public IP, e.g.
`XPENSIV_DOMAIN=203.0.113.10.sslip.io`. It resolves to that IP without any DNS setup and Let's
Encrypt issues a normal certificate for it. Put the variable in a `.env` file next to the compose
files so `docker compose` picks it up on every run. When you later get a real domain, change
`XPENSIV_DOMAIN` and run the same `up -d` command; Caddy fetches the new certificate itself.

To redeploy after a change, replace the source on the server and rebuild. Clear the old tree
first (keeping `.env`): extracting over it would leave behind files that were deleted from the
repo, and a stale file can break the build.

```sh
ssh myserver 'find /opt/xpensiv -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} +'
git archive HEAD | ssh myserver 'tar -x -C /opt/xpensiv'
ssh myserver 'cd /opt/xpensiv && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build'
```

Data lives in the `xpensiv-data` volume and survives rebuilds.

## Backup and restore

- **Backup (admin only):** Settings → Backup, or `GET /api/v1/backup` (`?passphrase=...` or header `X-Backup-Passphrase` to receive an encrypted `.db.enc`). Snapshots are produced with `VACUUM INTO`, so they are consistent even while the app is running, and are written with `0600` permissions.
- **Restore:** Settings → Restore (upload the `.db` or `.db.enc` plus passphrase), or `POST /api/v1/restore` (multipart `file`, `passphrase`). The current database is snapshotted to `data/backups/` first, then the snapshot's tables are copied in inside one transaction. The backup must be from the same schema version.
- **Manual:** stop the server and copy `data/xpensiv.db` (also copy `-wal`/`-shm` if present).

Encrypted backups use PBKDF2-SHA256 (200k iterations) + AES-256-GCM.

## Security notes

This app holds personal financial data.

- Always serve it over HTTPS when it leaves your machine: session cookies are only marked `Secure` on HTTPS, and browsers refuse service workers and PWA installation on plain HTTP (except `localhost`). Use `docker-compose.prod.yml` or your own TLS proxy.
- Set `XPENSIV_TRUSTED_PROXY=true` only when a proxy you control sits in front; otherwise clients could spoof `X-Forwarded-For` and evade login throttling.
- Set `XPENSIV_CORS_ORIGIN=` (empty) in production. The Vite dev origin is only needed for `make dev`.
- CSRF: mutating API calls must carry the `X-Xpensiv-Client` header and, when present, an `Origin` matching the host; cookies are `SameSite=Strict`.
- No third-party analytics, fonts, or external API calls.
- Logs contain method/path/status/request id only — never amounts, descriptions, account numbers, emails or passwords.
- The database file is `0600`, backups `0600`, and backup/restore is restricted to the admin because a snapshot contains every user's data.
- Rate limiting is per process; if you ever run several replicas, put a shared limiter in the proxy.

## Project layout

```
cmd/server            entrypoint (graceful shutdown, recurring scheduler)
internal/config       env configuration
internal/database     SQLite open/pragmas + embedded migrations (migrations/ symlinks here)
internal/handlers     Echo handlers (HTTP only)
internal/services     business logic
internal/repositories parameterized SQL
internal/reports      report queries + CSV/PDF export
internal/auth          users, sessions, invites, middleware (per-user scoping)
internal/models, dto, validators, errors, middleware, server, testutil
web/                  React PWA
docs/API.md           REST contract (data endpoints)
docs/AUTH.md          authentication / multi-user contract
```
