# Xpensiv REST API contract

Base path: `/api/v1`. All bodies are JSON unless stated. All monetary values are
**integer minor units** (chhertum for BTN: `Nu. 12.50` is `1250`). Dates are
`YYYY-MM-DD` local calendar dates. Timestamps are RFC3339 UTC.

## Authentication

Every endpoint below except `/health` and `/auth/*` requires a session cookie; mutating requests
also need the `X-Xpensiv-Client` header. See `docs/AUTH.md`. All data is scoped to the signed-in
user: ids belonging to another user behave as if they did not exist (`404`). `/backup` and
`/restore` require the `admin` role.

## Envelopes

- Single resource / object: `{"data": ...}`
- Paginated list: `{"data": [...], "meta": {"page": 1, "per_page": 50, "total": 123}}`
- Error: `{"error": {"code": "validation_error", "message": "...", "details": {"field": "msg"}, "request_id": "..."}}`

Status codes: 200 OK, 201 Created, 204 No Content, 400 bad_request, 404 not_found, 405 method_not_allowed,
409 conflict, 413 payload_too_large, 422 validation_error, 500 internal_error.

## Implemented (core)

| Method | Path | Notes |
|---|---|---|
| GET | /health | `{"status":"ok"}` |
| GET | /accounts?include_inactive=1 | Account includes `current_balance` (computed from ledger) |
| POST | /accounts | `{name,type,currency?,opening_balance,opening_balance_date?,account_number?}` type ∈ bank,cash,mobile_wallet,credit_card,savings |
| GET/PATCH | /accounts/:id | PATCH accepts any subset incl. `is_active` |
| GET | /categories?include_inactive=1 | Flat list; `parent_id` null = main category, set = sub-category of that main category. Every new user gets the default two-level tree (see `internal/auth/defaults.go`); users from before the tree are upgraded once at startup (`auth.UpgradeCategoryTrees`). |
| POST | /categories | `{name,icon,color,type('expense'|'income'),parent_id?}` — `parent_id` must be a category of the same type |
| GET/PATCH | /categories/:id | |
| GET | /transactions | query: search,date_from,date_to,category_id (a main category includes its sub-categories),account_id,type,status,origin,unmatched=1,sort(date|amount|created_at|payee),order(asc|desc),page,per_page(≤200) |
| GET | /transactions/export.csv | same filters, streams CSV |
| POST | /transactions | see below. Returns 201, or 200 if `client_id` was already seen (idempotent replay) |
| GET/PATCH/DELETE | /transactions/:id | PATCH is partial; `clear_category:true` / `clear_transfer_account:true` to null those. |
| POST | /transactions/:id/duplicate | body `{transaction_date?}` default today → 201 |
| PUT/POST | /transactions/:id/attachment | multipart `file`: one JPEG/PNG/WebP image (sniffed, ≤ XPENSIV_MAX_UPLOAD_BYTES) stored under `DATA_DIR/attachments/<user>/<id>`; replaces an earlier one → Transaction with `has_attachment: true` |
| GET | /transactions/:id/attachment | the image bytes (`Cache-Control: private`) |
| DELETE | /transactions/:id/attachment | → 204 |
| POST | /transactions/:id/attachment/scan | OCRs the stored screenshot, saves what it says as `receipt` → the parsed scan (see /receipts/scan). 501 when the server has no Tesseract |
| POST | /receipts/scan | multipart `file` → `{recognised, bank, amount, journal_no, from_account, to_account, payment_type, date, time}`; nothing stored. Templates: mBoB. 501 without Tesseract |
| GET | /receipts/capabilities | `{ocr: boolean, banks: ["mBoB"]}` |
| GET | /budgets | `[{id,category_id,amount}]` monthly amount per expense category |
| POST | /budgets | `{category_id, amount}` (409 if exists) |
| PATCH/DELETE | /budgets/:id | |
| GET/POST | /recurring | see model; `generate_as` ∈ cleared (auto-create) / pending (create drafts) |
| POST | /recurring/run?as_of=YYYY-MM-DD | generate due occurrences → `{generated,skipped,transaction_ids}` |
| GET/PATCH/DELETE | /recurring/:id | |
| GET/PATCH | /settings | flat `{key: value}`; keys: default_currency, ui.last_account_id, ui.last_category_id, ui.theme |
| GET | /backup?passphrase= | downloads SQLite snapshot (encrypted `.enc` when passphrase given; header `X-Backup-Passphrase` also accepted) |
| POST | /restore | multipart `file` (+ `passphrase`) |

### Transaction

```json
{
  "id":"uuid","type":"expense|income|transfer|refund|adjustment","amount":1250,"currency":"BTN",
  "account_id":"...","account_name":"BOB Savings","transfer_account_id":null,"transfer_account_name":"",
  "category_id":"cat-food","category_name":"Food","category_icon":"utensils","category_color":"#f97316",
  "description":"Lunch","payee":"Ambient Cafe","transaction_date":"2026-11-04","notes":"",
  "origin":"manual|adjustment","status":"cleared|pending|void","recurring_id":null,"tags":["work"],"has_attachment":false,"receipt":{"bank":"mBoB","reference":"551-428182","payment_type":"Personal Transfer","date":"2026-11-05","time":"01:38:10"},
  "created_at":"...","updated_at":"..."
}
```

Rules enforced by the server:
- `amount` > 0 for all types except `adjustment` (signed, non-zero).
- `transfer` requires `transfer_account_id` ≠ `account_id`; money leaves `account_id`, arrives at `transfer_account_id`; category is forced null. Transfers are never income/expense in any report.
- expense categories only on expense; income categories on income/refund.
- Only `status = cleared` counts toward balances/reports. `pending` = draft (recurring drafts). `void` is hidden by default.
- `client_id` (optional UUID from the offline queue) makes POST idempotent.
- `receipt` (optional on POST/PATCH; `clear_receipt:true` on PATCH drops it) holds what the payment screenshot said. Uploading an attachment fills it automatically when OCR is available and nothing is set yet; `search` also matches `receipt.reference`.

## Reports

### Reports (`internal/reports`, `internal/handlers/reports.go`)

All take `from`, `to` (YYYY-MM-DD, inclusive; give both or neither — neither means the current month). Transfers are excluded everywhere. Only `cleared` transactions. Expense totals include `expense` minus `refund`? **No**: refunds are reported as income-type inflows under their category; expenses are `expense` only. (Keeps every number traceable.)

| Method | Path | Returns |
|---|---|---|
| GET | /reports/summary?from&to | `{ total_balance, income, expenses, net, previous: {from,to,income,expenses,net}, expense_change_pct: number|null, pending_count, recent_transactions: Transaction[10] }` previous = same-length period immediately before |
| GET | /reports/categories?from&to&type=expense|income | `[{category_id, name, icon, color, amount, count, pct}]` uncategorised appears as `{category_id: null, name: "Uncategorised"}` |
| GET | /reports/cash-flow?from&to&granularity=day|week|month | `[{period: "2026-11-04"|"2026-W45"|"2026-11", income, expenses, net}]` zero-filled |
| GET | /reports/merchants?from&to&type=expense\|income | `[{payee, amount, count}]` top 50, blank payee grouped as "(no payee)" |
| GET | /reports/accounts | `[{account_id, name, type, currency, opening_balance, balance, income, expenses, transfers_in, transfers_out}]` for the period (balance is as-of now) |
| GET | /reports/budgets?month=YYYY-MM | `[{budget_id, category_id, name, icon, color, amount, spent, remaining, pct, level: "ok"|"warn75"|"warn90"|"over"}]` |
| GET | /reports/export?report=summary|categories|cash-flow|merchants|accounts|budgets&format=csv|pdf&… | file download |
