# Xpensiv REST API contract

Base path: `/api/v1`. All bodies are JSON unless stated. All monetary values are
**integer minor units** (chhertum for BTN: `Nu. 12.50` is `1250`). Dates are
`YYYY-MM-DD` local calendar dates. Timestamps are RFC3339 UTC.

## Envelopes

- Single resource / object: `{"data": ...}`
- Paginated list: `{"data": [...], "meta": {"page": 1, "per_page": 50, "total": 123}}`
- Error: `{"error": {"code": "validation_error", "message": "...", "details": {"field": "msg"}, "request_id": "..."}}`

Status codes: 200 OK, 201 Created, 204 No Content, 400 bad_request, 404 not_found,
409 conflict, 413 payload_too_large, 422 validation_error, 500 internal_error.

## Implemented (core)

| Method | Path | Notes |
|---|---|---|
| GET | /health | `{"status":"ok"}` |
| GET | /accounts?include_inactive=1 | Account includes `current_balance` (computed from ledger) |
| POST | /accounts | `{name,type,currency?,opening_balance,opening_balance_date?,account_number?}` type ∈ bank,cash,mobile_wallet,credit_card,savings |
| GET/PATCH | /accounts/:id | PATCH accepts any subset incl. `is_active` |
| GET | /categories?include_inactive=1 | |
| POST | /categories | `{name,icon,color,type('expense'|'income'),parent_id?}` |
| GET/PATCH | /categories/:id | |
| GET | /transactions | query: search,date_from,date_to,category_id,account_id,type,status,origin,unmatched=1,sort(date|amount|created_at|payee),order(asc|desc),page,per_page(≤200) |
| GET | /transactions/export.csv | same filters, streams CSV |
| POST | /transactions | see below. Returns 201, or 200 if `client_id` was already seen (idempotent replay) |
| GET/PATCH/DELETE | /transactions/:id | PATCH is partial; `clear_category:true` / `clear_transfer_account:true` to null those |
| POST | /transactions/:id/duplicate | body `{transaction_date?}` default today → 201 |
| GET | /budgets | `[{id,category_id,amount}]` monthly amount per expense category |
| POST | /budgets | `{category_id, amount}` (409 if exists) |
| PATCH/DELETE | /budgets/:id | |
| GET/POST | /recurring | see model; `generate_as` ∈ cleared (auto-create) / pending (create drafts) |
| POST | /recurring/run?as_of=YYYY-MM-DD | generate due occurrences → `{generated,skipped,transaction_ids}` |
| GET/PATCH/DELETE | /recurring/:id | |
| GET/PATCH | /settings | flat `{key: value}`; keys: reconciliation.date_tolerance_days, default_currency, ui.last_account_id, ui.last_category_id, ui.theme |
| GET | /backup?passphrase= | downloads SQLite snapshot (encrypted `.enc` when passphrase given; header `X-Backup-Passphrase` also accepted) |
| POST | /restore | multipart `file` (+ `passphrase`) |

### Transaction

```json
{
  "id":"uuid","type":"expense|income|transfer|refund|adjustment","amount":1250,"currency":"BTN",
  "account_id":"...","account_name":"BOB Savings","transfer_account_id":null,"transfer_account_name":"",
  "category_id":"cat-food","category_name":"Food","category_icon":"utensils","category_color":"#f97316",
  "description":"Lunch","payee":"Ambient Cafe","transaction_date":"2026-11-04","notes":"",
  "origin":"manual|imported|adjustment","status":"cleared|pending|void","recurring_id":null,
  "source_bank_transaction_id":null,"tags":["work"],
  "reconciliation_status":"matched|ignored|transfer|","bank_transaction_id":null,
  "created_at":"...","updated_at":"..."
}
```

Rules enforced by the server:
- `amount` > 0 for all types except `adjustment` (signed, non-zero).
- `transfer` requires `transfer_account_id` ≠ `account_id`; money leaves `account_id`, arrives at `transfer_account_id`; category is forced null. Transfers are never income/expense in any report.
- expense categories only on expense; income categories on income/refund.
- Only `status = cleared` counts toward balances/reports. `pending` = draft (recurring drafts). `void` is hidden by default.
- `client_id` (optional UUID from the offline queue) makes POST idempotent.

## To be implemented by domain agents (contract)

### Statements (`internal/pdf`, `internal/handlers/statements.go`, `internal/services/statements.go`)

| Method | Path | Body / Notes |
|---|---|---|
| POST | /statements/parse | multipart: `file` (PDF, ≤ XPENSIV_MAX_UPLOAD_BYTES), `account_id`, `password?` (BOB statements are password-protected; hint shown in UI: "DDMM of your DOB"), `provider?` default `bob`. Returns **ImportPreview** (nothing persisted). Error codes: `pdf_password_required` (400), `pdf_password_incorrect` (400), `pdf_no_text` (422, scanned/needs OCR), `pdf_unrecognised` (422, could not detect statement table), `invalid_file` (400). |
| POST | /statements/import | JSON **ImportRequest** → 201 `{"data": Statement}`. Uses `upload_token` from the preview to retrieve the cached original PDF (kept 30 min, in `DATA_DIR/statements/pending`). 409 `duplicate_statement` if same sha256 already imported unless `force:true`. |
| GET | /statements | `[Statement]` newest first |
| GET | /statements/:id | Statement |
| GET | /statements/:id/transactions | `[BankTransactionWithStatus]` ordered by line_no |
| GET | /statements/:id/file | original PDF bytes (audit) |
| DELETE | /statements/:id | deletes statement + its bank transactions (+ reconciliations via cascade). Manual transactions are never touched. |

```ts
type ImportPreview = {
  upload_token: string; file_name: string; file_sha256: string; file_size: number; provider: "bob";
  account_id: string; text_extraction: "text" | "none";
  statement: { account_number: string; account_holder: string; currency: string;
               period_start: string; period_end: string;
               opening_balance: number | null; closing_balance: number | null;
               total_debits: number; total_credits: number; transaction_count: number };
  transactions: Array<{ line_no: number; transaction_date: string; value_date: string | null;
               description: string; reference: string; debit: number; credit: number; balance: number | null;
               fingerprint: string; is_duplicate: boolean; warnings: string[] }>;
  validation: { balance_check: "ok" | "mismatch" | "unavailable"; computed_closing: number | null;
                difference: number; messages: string[] };
  duplicate_statement: null | { id: string; file_name: string; imported_at: string; reason: "sha256" | "period" | "fingerprints" };
  warnings: string[];   // page-level parse warnings, e.g. "3 lines could not be parsed and were skipped"
}
type ImportRequest = {
  upload_token: string; account_id: string; force?: boolean; skip_duplicates?: boolean /* default true */;
  statement: ImportPreview["statement"];                      // user-corrected
  transactions: ImportPreview["transactions"];                // user-corrected rows (fingerprints recomputed server-side)
}
type Statement = { id, provider, account_id, file_name, file_sha256, file_size, account_number, account_holder,
  period_start, period_end, opening_balance, closing_balance, total_debits, total_credits, transaction_count,
  balance_verified: boolean, notes, imported_at,
  // computed:
  matched_count: number, unmatched_count: number, ignored_count: number }
type BankTransactionWithStatus = BankTransaction & { status: "matched"|"unrecorded"|"ignored"|"transfer";
  reconciliation: Reconciliation | null; transaction: Transaction | null }
```

Fingerprint = sha256(`account_id|transaction_date|normalised description|debit|credit|balance`)[:32]. Duplicate = fingerprint already in `bank_transactions` for the same account.

### Reconciliation (`internal/reconciliation`, `internal/handlers/reconciliation.go`)

| Method | Path | Body |
|---|---|---|
| GET | /reconciliation | `{ statements: [ {statement_id, file_name, period_start, period_end, account_id, account_name, total: n, matched: n, unrecorded: n, ignored: n, transfer: n} ], unmatched_manual_count, unreconciled_bank_count }` |
| GET | /reconciliation/:statement_id | **Workspace** |
| POST | /reconciliation/auto-match | `{statement_id}` → `{matched: n}`; applies only rule 1 and rule 2 **when the candidate is unique**. Rules 3–4 are suggestions only. |
| POST | /reconciliation/match | `{bank_transaction_id, transaction_id, note?}` → Reconciliation (manual). 409 if either side already matched. |
| POST | /reconciliation/unmatch | `{bank_transaction_id}` → 204. Also used to un-ignore / un-transfer. |
| POST | /reconciliation/ignore | `{bank_transaction_id, note?}` → Reconciliation(status ignored) |
| POST | /reconciliation/transfer | `{bank_transaction_id, transaction_id?, transfer_account_id?}`: link to an existing transfer transaction, or create one (between the statement account and `transfer_account_id`, direction from debit/credit) → `{reconciliation, transaction}` |
| POST | /reconciliation/create-transaction | `{bank_transaction_id, category_id?, payee?, description?, notes?}` → creates a transaction (origin `imported`, `source_bank_transaction_id` set, type expense for debit / income for credit) and matches it → `{reconciliation, transaction}` |
| POST | /reconciliation/adjustment | `{bank_transaction_id, transaction_id, note?}` → matches the pair and creates an `adjustment` transaction for the difference (bank − manual, signed, on the statement account) → `{reconciliation, transaction, adjustment}` |

```ts
type Suggestion = { transaction_id: string; transaction: Transaction; rule: "exact_date"|"date_tolerance"|"merchant_similarity"|"description_similarity";
  confidence: number /*0-100*/; amount_diff: number; date_diff_days: number; reason: string }
type Workspace = {
  statement: Statement; account: Account; date_tolerance_days: number;
  bank_transactions: Array<BankTransactionWithStatus & { suggestions: Suggestion[] }>;
  manual_transactions: Array<Transaction & { status: "matched"|"unmatched"|"possible_duplicate"|"ignored"|"transfer"; duplicate_of?: string }>;
  summary: { total_debits, total_credits, manual_expenses, manual_income, matched, unmatched_manual, unrecorded_bank, ignored, transfers,
             amount_discrepancies: number, balance_verified: boolean }
}
```
Manual transactions in the workspace = non-void transactions whose `account_id` or `transfer_account_id` is the statement account, dated within [period_start − tolerance, period_end + tolerance].
"possible_duplicate" = two unmatched manual transactions with same amount, same account and date within 1 day.

### Reports (`internal/reports`, `internal/handlers/reports.go`)

All take `from`, `to` (YYYY-MM-DD, inclusive). Transfers are excluded everywhere. Only `cleared` transactions. Expense totals include `expense` minus `refund`? **No**: refunds are reported as income-type inflows under their category; expenses are `expense` only. (Keeps every number traceable.)

| Method | Path | Returns |
|---|---|---|
| GET | /reports/summary?from&to | `{ total_balance, income, expenses, net, previous: {from,to,income,expenses,net}, expense_change_pct: number|null, unreconciled_bank_count, unmatched_manual_count, pending_count, recent_transactions: Transaction[10] }` previous = same-length period immediately before |
| GET | /reports/categories?from&to&type=expense|income | `[{category_id, name, icon, color, amount, count, pct}]` uncategorised appears as `{category_id: null, name: "Uncategorised"}` |
| GET | /reports/cash-flow?from&to&granularity=day|week|month | `[{period: "2026-11-04"|"2026-W45"|"2026-11", income, expenses, net}]` zero-filled |
| GET | /reports/merchants?from&to&type=expense | `[{payee, amount, count}]` top 50, blank payee grouped as "(no payee)" |
| GET | /reports/accounts | `[{account_id, name, type, currency, opening_balance, balance, income, expenses, transfers_in, transfers_out}]` for the period (balance is as-of now) |
| GET | /reports/budgets?month=YYYY-MM | `[{budget_id, category_id, name, icon, color, amount, spent, remaining, pct, level: "ok"|"warn75"|"warn90"|"over"}]` |
| GET | /reports/reconciliation?statement_id= | `{ statement, total_debits, total_credits, manual_expenses, manual_income, matched, unmatched_manual: Transaction[], unrecorded_bank: BankTransaction[], amount_discrepancies: [{bank_transaction, transaction, difference}], balance: {opening, closing, computed_closing, verified} }` |
| GET | /reports/export?report=summary|categories|cash-flow|merchants|accounts|budgets|reconciliation&format=csv|pdf&… | file download |
