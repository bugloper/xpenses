# Xpenses REST API contract

Base path: `/api/v1`. All bodies are JSON unless stated. All monetary values are
**integer minor units** (chhertum for BTN: `Nu. 12.50` is `1250`). Dates are
`YYYY-MM-DD` local calendar dates. Timestamps are RFC3339 UTC.

## Authentication

Every endpoint below except `/health` and `/auth/*` requires a session cookie; mutating requests
also need the `X-Xpenses-Client` header. See `docs/AUTH.md`. All data is scoped to the signed-in
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
| GET | /accounts/:id/usage | `{transactions, recurring}` — what still refers to the account (as source or transfer destination) |
| DELETE | /accounts/:id | 204; 409 `conflict` while any transaction or recurring rule refers to it (deactivate instead) |
| GET | /categories?include_inactive=1 | Flat list; `parent_id` null = main category, set = sub-category of that main category. Every new user gets the default two-level tree (see `internal/auth/defaults.go`); users from before the tree are upgraded once at startup (`auth.UpgradeCategoryTrees`). |
| POST | /categories | `{name,icon,color,type('expense'|'income'),parent_id?}` — `parent_id` must be a category of the same type |
| GET/PATCH | /categories/:id | |
| GET | /categories/:id/usage | `{sub_categories, transactions, budgets, recurring}`; a main category's counts include its sub-categories |
| DELETE | /categories/:id | 204; a main category goes with its sub-categories. Their transactions stay with `category_id` null (Uncategorised), recurring rules lose the category, budgets on them are deleted |
| GET | /transactions | query: search,date_from,date_to,category_id (a main category includes its sub-categories),account_id,type (`loan` = every loan movement),loan_id,status,origin,unmatched=1,sort(date|amount|created_at|payee),order(asc|desc),page,per_page(≤200) |
| GET | /transactions/export.csv | same filters, streams CSV |
| POST | /transactions | see below. Returns 201, or 200 if `client_id` was already seen (idempotent replay) |
| GET/PATCH/DELETE | /transactions/:id | PATCH is partial; `clear_category:true` / `clear_transfer_account:true` to null those. |
| POST | /transactions/bulk-delete | body `{ids: [...]}` (1–500) → `{deleted: n}`; one database transaction; unknown or other users' ids are skipped; attachments go with their transactions |
| POST | /transactions/:id/duplicate | body `{transaction_date?}` default today → 201 |
| PUT/POST | /transactions/:id/attachment | multipart `file`: one JPEG/PNG/WebP image (sniffed, ≤ XPENSES_MAX_UPLOAD_BYTES) stored under `DATA_DIR/attachments/<user>/<id>`; replaces an earlier one → Transaction with `has_attachment: true` |
| GET | /transactions/:id/attachment | the image bytes (`Cache-Control: private`) |
| DELETE | /transactions/:id/attachment | → 204 |
| POST | /transactions/:id/attachment/scan | OCRs the stored screenshot, saves what it says as `receipt` → the parsed scan (see /receipts/scan). 501 when the server has no Tesseract |
| POST | /receipts/scan | multipart `file` → `{recognised, bank, amount, journal_no, from_account, to_account, payment_type, date, time}`; nothing stored. Templates: mBoB, mPay (`journal_no` carries the RRNO; accounts empty). 501 without Tesseract |
| GET | /receipts/capabilities | `{ocr: boolean, banks: ["mBoB", "mPay"]}` |
| GET | /budgets | `[{id,category_id,amount}]` monthly amount per expense category |
| POST | /budgets | `{category_id, amount}` (409 if exists) |
| PATCH/DELETE | /budgets/:id | |
| GET/POST | /recurring | see model; `generate_as` ∈ cleared (auto-create) / pending (create drafts) |
| POST | /recurring/run?as_of=YYYY-MM-DD | generate due occurrences → `{generated,skipped,transaction_ids}` |
| GET/PATCH/DELETE | /recurring/:id | |
| GET | /loans | `[Loan]`, open ones first. See Loan below |
| POST | /loans | `{direction: given\|received, counterparty, opening_amount > 0, start_date?, due_date?, notes?}` records a loan that already exists (what is owed today; no money moves) → 201. New lending or borrowing is a transaction instead |
| GET/PATCH/DELETE | /loans/:id | PATCH `{counterparty?, opening_amount?, start_date?, due_date?, clear_due_date?, notes?}` (direction and currency stay; the opening amount may not drop below what was repaid → 422). DELETE → 204, or 409 while any transaction refers to it |
| GET | /savings-goals | `[SavingsGoal]`, goals still being saved for first |
| POST | /savings-goals | `{name, target_amount > 0, target_date?, account_id?, notes?}` → 201 GoalDetail; names are unique per user |
| GET/PATCH/DELETE | /savings-goals/:id | GoalDetail (the goal with `entries`, newest first). PATCH partial, `clear_target_date` / `clear_account`. DELETE removes the goal and its entries; transfers they made stay |
| POST | /savings-goals/:id/entries | `{amount ≠ 0, entry_date?, note?, from_account_id?, to_account_id?}`: positive adds to the goal, negative takes from it (not more than it holds → 422). `from_account_id` on a contribution / `to_account_id` on a withdrawal also records a transfer to / from the goal's `account_id` (422 when the goal has none) → 201 GoalDetail |
| DELETE | /savings-goals/:id/entries/:entry | → 200 GoalDetail; also deletes the entry's transfer. 409 when withdrawals already use the money it added |
| GET/PATCH | /settings | flat `{key: value}`; keys: default_currency, ui.last_account_id, ui.last_category_id, ui.theme |
| GET | /feedback | `{kinds:[{key,label}], messages:[{id,kind,kind_label,body,status,reply,created_at,acknowledged_at,replied_at}]}`, the user's own, newest first. Allowed for a user whose free year has ended |
| POST | /feedback | `{kind: feedback\|feature\|support, body}` (≤ 2000 chars) → 201. Allowed after the free year ends |
| GET/PUT/DELETE | /testimonial | the user's one testimonial (`null` when none); PUT `{body}` (20–300 chars) saves it as `pending`, so a rewrite goes back for review |
| GET | /public/testimonials | no session; approved testimonials of active users `[{id, body, name, since: "YYYY-MM"}]`, newest approval first, at most 12 |
| GET | /admin/community | `{new_feedback, pending_testimonials}` |
| GET | /admin/feedback?status=new\|acknowledged\|replied | the inbox with `from:{id,name,email}`; no status = all |
| POST | /admin/feedback/:id/acknowledge | 204; marks a new message seen |
| POST | /admin/feedback/:id/reply | `{reply}` → 204; one reply per message (409 after that) |
| GET | /admin/testimonials?status=pending\|approved\|hidden | review list; no status = all |
| POST | /admin/testimonials/:id/approve, /admin/testimonials/:id/hide | 204 |
| GET | /backup?passphrase= | downloads SQLite snapshot (encrypted `.enc` when passphrase given; header `X-Backup-Passphrase` also accepted) |
| POST | /restore | multipart `file` (+ `passphrase`) |

### Transaction

```json
{
  "id":"uuid","type":"expense|income|transfer|refund|adjustment|loan_given|loan_received|loan_repayment|loan_repayment_received","amount":1250,"currency":"BTN",
  "account_id":"...","account_name":"BOB Savings","transfer_account_id":null,"transfer_account_name":"",
  "category_id":"cat-food","category_name":"Food","category_icon":"utensils","category_color":"#f97316",
  "description":"Lunch","payee":"Ambient Cafe","transaction_date":"2026-11-04","notes":"",
  "origin":"manual|adjustment","status":"cleared|pending|void","recurring_id":null,"tags":["work"],"has_attachment":false,
  "loan_id":null,"loan_counterparty":"","receipt":{"bank":"mBoB","reference":"551-428182","payment_type":"Personal Transfer","date":"2026-11-05","time":"01:38:10"},
  "created_at":"...","updated_at":"..."
}
```

Rules enforced by the server:
- `amount` > 0 for all types except `adjustment` (signed, non-zero).
- `transfer` requires `transfer_account_id` ≠ `account_id`; money leaves `account_id`, arrives at `transfer_account_id`; category is forced null. Transfers are never income/expense in any report.
- expense categories only on expense; income categories on income. A refund takes the expense category it refunds (refunds recorded earlier under an income category keep it).
- Loan movements need `loan_id` (or, for `loan_given` / `loan_received`, `new_loan: {counterparty, due_date?}` to start one) of the matching direction: `loan_given` and `loan_repayment_received` belong to loans given, `loan_received` and `loan_repayment` to loans received. The currency must be the loan's. A repayment may not exceed what is still owed (checked for cleared rows, inside the write transaction). No category, no transfer account.
- Balances: `loan_received` and `loan_repayment_received` add to `account_id`; `loan_given` and `loan_repayment` take from it. None of them is income or expense.
- `interest` (POST only, with a repayment) records a second row in the same database transaction: an `expense` (paying back) or `income` (being paid back) of that amount on the same account and date, carrying the loan's `loan_id`, under the default *Interest payments* / *Interest* category when the user has it.
- Changing a loan movement's `type` to a non-loan type takes it off its loan.
- Only `status = cleared` counts toward balances/reports. `pending` = draft (recurring drafts). `void` is hidden by default.
- `client_id` (optional UUID from the offline queue) makes POST idempotent.
- `receipt` (optional on POST/PATCH; `clear_receipt:true` on PATCH drops it) holds what the payment screenshot said. Uploading an attachment fills it automatically when OCR is available and nothing is set yet; `search` also matches `receipt.reference`.

### Loan

```json
{
  "id":"uuid","direction":"given|received","counterparty":"Ugyen Dorji","opening_amount":0,"currency":"BTN",
  "start_date":"2026-10-30","due_date":"2026-12-15","notes":"",
  "principal":180000,"repaid":70000,"outstanding":110000,"interest":0,
  "transaction_count":2,"last_activity":"2026-11-06","status":"open|settled",
  "created_at":"...","updated_at":"..."
}
```

Nothing after `notes` is stored: `principal` = `opening_amount` + cleared `loan_given`/`loan_received`; `repaid` = cleared repayments; `outstanding` = principal − repaid; `interest` = cleared expense/income rows carrying the loan's id; `status` is `settled` once nothing is outstanding.

### SavingsGoal

`{id, name, target_amount, target_date, account_id, account_name, notes, saved, pct (0–100, one decimal), reached, created_at, updated_at}`. `saved` is the sum of the goal's entries: an allocation, never an account balance or an expense. GoalDetail adds `entries: [{id, goal_id, amount, entry_date, note, transaction_id, created_at}]`.

## Reports

### Reports (`internal/reports`, `internal/handlers/reports.go`)

All take `from`, `to` (YYYY-MM-DD, inclusive; give both or neither — neither means the current month). Only `cleared` transactions. Income is `income` only. Expenses are `expense` less `refund`: a refund reduces spending in the category it refunds (a refund under an income category reduces uncategorised spending), and category or merchant rows that net to zero or below are left out. Transfers, loan movements and adjustments are neither income nor expense; interest on a loan is an ordinary expense/income row.

| Method | Path | Returns |
|---|---|---|
| GET | /reports/summary?from&to | `{ total_balance, income, expenses, net, previous: {from,to,income,expenses,net}, expense_change_pct: number|null, pending_count, recent_transactions: Transaction[10] }` previous = same-length period immediately before |
| GET | /reports/categories?from&to&type=expense|income | `[{category_id, name, icon, color, amount, count, pct}]` uncategorised appears as `{category_id: null, name: "Uncategorised"}` |
| GET | /reports/cash-flow?from&to&granularity=day|week|month | `[{period: "2026-11-04"|"2026-W45"|"2026-11", income, expenses, net}]` zero-filled |
| GET | /reports/merchants?from&to&type=expense\|income | `[{payee, amount, count}]` top 50, blank payee grouped as "(no payee)" |
| GET | /reports/accounts | `[{account_id, name, type, currency, opening_balance, balance, income, expenses, transfers_in, transfers_out, loans_in, loans_out}]` for the period (balance is as-of now). `loans_in` = borrowed + repaid to the user, `loans_out` = lent + paid back |
| GET | /reports/loans?from&to | `[{period: "YYYY-MM", lent, repaid_to_you, borrowed, you_repaid, interest_paid, interest_earned}]` one row per month of the range, zero-filled. Principal is never income or expense; the interest columns are the loan-linked expense/income rows |
| GET | /reports/savings?from&to | `[{period: "YYYY-MM", added, taken}]` savings goal contributions and withdrawals per month (allocations, not balances) |
| GET | /reports/budgets?month=YYYY-MM | `[{budget_id, category_id, name, icon, color, amount, spent, remaining, pct, level: "ok"|"warn75"|"warn90"|"over"}]` |
| GET | /reports/export?report=summary|categories|cash-flow|merchants|accounts|budgets&format=csv|pdf&… | file download |
