# Xpensiv

Personal expense tracker and Bank of Bhutan (BOB) statement reconciliation app.
Single user, local-first, installable as a PWA, with offline expense entry.

- **Backend:** Go, Echo v4, SQLite (`modernc.org/sqlite`, no CGO), embedded SQL migrations.
- **Frontend:** React, TypeScript, Vite, TanStack Router/Query, Tailwind, shadcn/ui, Recharts, `vite-plugin-pwa`.
- **Money:** every amount is an integer in minor units (chhertum). No floats anywhere in the financial path.

## Features

- Expenses, income, transfers, refunds, adjustments; accounts (bank, cash, mobile wallet, credit card, savings) with ledger-calculated balances.
- Default categories, custom categories, monthly budgets per category with 75/90/100% warnings.
- Recurring transactions (daily/weekly/monthly/yearly) generated as drafts or real entries, never duplicated.
- BOB statement PDF import (password-protected PDFs supported) with preview, correction, balance validation and duplicate detection.
- Reconciliation workspace: deterministic suggested matches, confirm/reject, manual match, ignore, mark as transfer, create from bank line, adjustments. Fully reversible.
- Reports (monthly, daily, weekly, category, merchant, income vs expense, accounts, budgets, reconciliation) with CSV and PDF export.
- PWA: installable, offline shell, offline transaction queue with sync indicator, update notifications.
- Backup/restore (optionally AES-256-GCM encrypted).

## Development setup

Requirements: Go 1.26+, Bun 1.x.

```sh
cp .env.example .env            # optional; defaults work
cd web && bun install && cd ..
make dev                        # API on http://127.0.0.1:8080, UI on http://localhost:5173
```

`make dev` runs the Go API (`XPENSIV_STATIC_DIR=` so it serves only the API) and the Vite dev server, which proxies `/api` to the Go process.

Run them separately with `make dev-api` and `make dev-web`.

Data lives in `./data/` by default (`xpensiv.db`, uploaded statements under `statements/`, backups under `backups/`). The directory and database file are created with `0700`/`0600` permissions.

## Tests

```sh
make test-api     # go test ./...   (unit + SQLite integration tests via httptest)
make test-web     # vitest + React Testing Library
make e2e          # Playwright (needs the app running; see web/e2e)
make lint         # gofmt, go vet, eslint, tsc
```

## Production build

```sh
make build        # builds web/dist and bin/xpensiv
./bin/xpensiv     # serves API + UI on http://127.0.0.1:8080
```

Configuration is via environment variables (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `XPENSIV_ADDR` | `127.0.0.1:8080` | Listen address |
| `XPENSIV_DATA_DIR` | `./data` | SQLite DB, statements, backups |
| `XPENSIV_MAX_UPLOAD_BYTES` | `10485760` | Max statement PDF size |
| `XPENSIV_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `XPENSIV_STATIC_DIR` | `./web/dist` | Built frontend to serve (empty = API only) |
| `XPENSIV_CORS_ORIGIN` | `http://localhost:5173` | Dev-server origin allowed for CORS (set empty in production) |
| `XPENSIV_DEFAULT_CURRENCY` | `BTN` | Currency for new accounts |

### Docker

```sh
docker compose up -d --build     # http://127.0.0.1:8080, data in the xpensiv-data volume
```

## Importing a BOB statement

1. Download the account statement PDF from mBoB / BOB internet banking.
2. Bank Statements → Import → choose the account, pick the PDF and enter the PDF password (BOB protects statements; the hint shown is "DDMM of your DOB"). The password is used only in memory to decrypt the file and is never stored or logged.
3. Review the preview: metadata, every parsed line, balance validation and duplicate warnings. Correct any field inline.
4. Confirm. The original PDF is kept under `data/statements/<id>.pdf` for auditing; imported lines are stored separately from your manual transactions and never overwrite them.
5. Open Reconciliation for the statement, run auto-match, then confirm/reject suggestions.

The parser is header-driven and tolerant of layout variations (see `internal/pdf/bob.go`). If a statement is not recognised, nothing is imported and the error says why; scanned (image-only) PDFs are rejected with a clear message until OCR is added.

## Backup and restore

- **Backup:** Settings → Backup, or `GET /api/v1/backup` (`?passphrase=...` or header `X-Backup-Passphrase` to receive an encrypted `.db.enc`). Snapshots are produced with `VACUUM INTO`, so they are consistent even while the app is running, and are written with `0600` permissions.
- **Restore:** Settings → Restore (upload the `.db` or `.db.enc` plus passphrase), or `POST /api/v1/restore` (multipart `file`, `passphrase`). The current database is snapshotted to `data/backups/` first, then the snapshot's tables are copied in inside one transaction. The backup must be from the same schema version.
- **Manual:** stop the server and copy `data/xpensiv.db` (also copy `-wal`/`-shm` if present) and `data/statements/`.

Encrypted backups use PBKDF2-SHA256 (200k iterations) + AES-256-GCM.

## Security notes

This app holds personal financial data and has **no authentication layer**: anyone who can reach the port can read and change everything.

- By default it listens on `127.0.0.1` only. Keep it that way on shared networks.
- If you expose it on a LAN (`XPENSIV_ADDR=0.0.0.0:8080`) or the internet, put it behind a reverse proxy that terminates TLS and adds authentication (e.g. Caddy/nginx with basic auth, Tailscale, or a VPN). PWA installation requires HTTPS or `localhost`.
- No third-party analytics, fonts, or external API calls. PDFs are parsed locally.
- Logs contain method/path/status/request id only — never amounts, descriptions, account numbers or passwords.
- Set `XPENSIV_CORS_ORIGIN=` (empty) in production.

## Project layout

```
cmd/server            entrypoint (graceful shutdown, recurring scheduler)
internal/config       env configuration
internal/database     SQLite open/pragmas + embedded migrations (migrations/ symlinks here)
internal/handlers     Echo handlers (HTTP only)
internal/services     business logic
internal/repositories parameterized SQL
internal/pdf          PDF text extraction + statement parsers (BOB)
internal/reconciliation matching engine + reconciliation service
internal/reports      report queries + CSV/PDF export
internal/models, dto, validators, errors, middleware, server
web/                  React PWA
testdata/statements   synthetic statement fixtures (no real data)
docs/API.md           REST contract
```
