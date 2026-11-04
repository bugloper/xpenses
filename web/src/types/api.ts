// TypeScript mirror of docs/API.md. All money fields are integer minor units.

export type Envelope<T> = { data: T }
export type Paginated<T> = { data: T[]; meta: { page: number; per_page: number; total: number } }
export type ApiErrorBody = {
  error: { code: string; message: string; details?: Record<string, string>; request_id?: string }
}

export type AccountType = 'bank' | 'cash' | 'mobile_wallet' | 'credit_card' | 'savings'
export const ACCOUNT_TYPES: AccountType[] = ['bank', 'cash', 'mobile_wallet', 'credit_card', 'savings']

export type Account = {
  id: string
  name: string
  type: AccountType
  currency: string
  opening_balance: number
  opening_balance_date: string
  account_number: string
  is_active: boolean
  current_balance: number
  created_at: string
  updated_at: string
}

export type CreateAccountRequest = {
  name: string
  type: AccountType
  currency?: string
  opening_balance: number
  opening_balance_date?: string
  account_number?: string
}
export type UpdateAccountRequest = Partial<CreateAccountRequest> & { is_active?: boolean }

export type CategoryType = 'expense' | 'income'
export type Category = {
  id: string
  name: string
  icon: string
  color: string
  type: CategoryType
  parent_id: string | null
  is_active: boolean
  is_system: boolean
  sort_order: number
  created_at: string
  updated_at: string
}
export type CreateCategoryRequest = {
  name: string
  icon: string
  color: string
  type: CategoryType
  parent_id?: string | null
}
export type UpdateCategoryRequest = {
  name?: string
  icon?: string
  color?: string
  parent_id?: string | null
  is_active?: boolean
  sort_order?: number
}

export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'
export const TRANSACTION_TYPES: TransactionType[] = ['expense', 'income', 'transfer', 'refund', 'adjustment']
export type TransactionStatus = 'cleared' | 'pending' | 'void'
export type TransactionOrigin = 'manual' | 'imported' | 'adjustment'
export type ReconciliationStatus = 'matched' | 'ignored' | 'transfer' | ''

export type Transaction = {
  id: string
  type: TransactionType
  amount: number
  currency: string
  account_id: string
  account_name?: string
  transfer_account_id: string | null
  transfer_account_name?: string
  category_id: string | null
  category_name?: string
  category_icon?: string
  category_color?: string
  description: string
  payee: string
  transaction_date: string
  notes: string
  origin: TransactionOrigin
  status: TransactionStatus
  recurring_id: string | null
  source_bank_transaction_id: string | null
  client_id?: string | null
  tags: string[] | null
  reconciliation_status?: ReconciliationStatus
  bank_transaction_id?: string | null
  created_at: string
  updated_at: string
}

export type CreateTransactionRequest = {
  type: TransactionType
  amount: number
  currency?: string
  account_id: string
  transfer_account_id?: string | null
  category_id?: string | null
  description?: string
  payee?: string
  transaction_date: string
  notes?: string
  tags?: string[]
  status?: TransactionStatus
  client_id?: string
}

export type UpdateTransactionRequest = {
  type?: TransactionType
  amount?: number
  currency?: string
  account_id?: string
  transfer_account_id?: string | null
  category_id?: string | null
  description?: string
  payee?: string
  transaction_date?: string
  notes?: string
  tags?: string[]
  status?: TransactionStatus
  clear_category?: boolean
  clear_transfer_account?: boolean
}

export type TransactionSort = 'date' | 'amount' | 'created_at' | 'payee'

export type TransactionFilter = {
  search?: string
  date_from?: string
  date_to?: string
  category_id?: string
  account_id?: string
  type?: TransactionType
  status?: TransactionStatus
  origin?: TransactionOrigin
  unmatched?: boolean
  sort?: TransactionSort
  order?: 'asc' | 'desc'
  page?: number
  per_page?: number
}

export type Budget = {
  id: string
  category_id: string
  amount: number
  created_at: string
  updated_at: string
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RecurringTransaction = {
  id: string
  name: string
  type: TransactionType
  amount: number
  currency: string
  account_id: string
  transfer_account_id: string | null
  category_id: string | null
  description: string
  payee: string
  frequency: RecurringFrequency
  interval: number
  start_date: string
  end_date: string | null
  next_run_date: string
  generate_as: 'cleared' | 'pending'
  is_active: boolean
  created_at: string
  updated_at: string
}
export type CreateRecurringRequest = {
  name: string
  type: TransactionType
  amount: number
  currency?: string
  account_id: string
  transfer_account_id?: string | null
  category_id?: string | null
  description?: string
  payee?: string
  frequency: RecurringFrequency
  interval: number
  start_date: string
  end_date?: string | null
  generate_as: 'cleared' | 'pending'
}
export type UpdateRecurringRequest = Partial<Omit<CreateRecurringRequest, 'type' | 'start_date'>> & {
  next_run_date?: string
  is_active?: boolean
}
export type RecurringRunResult = { generated: number; skipped: number; transaction_ids: string[] }

export type Settings = {
  'reconciliation.date_tolerance_days'?: string
  default_currency?: string
  'ui.last_account_id'?: string
  'ui.last_category_id'?: string
  'ui.theme'?: string
  [key: string]: string | undefined
}

// Reports
export type ReportSummary = {
  total_balance: number
  income: number
  expenses: number
  net: number
  previous: { from: string; to: string; income: number; expenses: number; net: number }
  expense_change_pct: number | null
  unreconciled_bank_count: number
  unmatched_manual_count: number
  pending_count: number
  recent_transactions: Transaction[]
}
export type ReportCategory = {
  category_id: string | null
  name: string
  icon: string
  color: string
  amount: number
  count: number
  pct: number
}
export type ReportCashFlow = { period: string; income: number; expenses: number; net: number }
export type ReportBudget = {
  budget_id: string
  category_id: string
  name: string
  icon: string
  color: string
  amount: number
  spent: number
  remaining: number
  pct: number
  level: 'ok' | 'warn75' | 'warn90' | 'over'
}
export type ReportMerchant = { payee: string; amount: number; count: number }
export type ReportAccount = {
  account_id: string
  name: string
  type: AccountType
  currency: string
  opening_balance: number
  balance: number
  income: number
  expenses: number
  transfers_in: number
  transfers_out: number
}

// Statements / reconciliation (consumed by other agents' screens; kept here for the counts on the dashboard)
export type Statement = {
  id: string
  provider: string
  account_id: string
  file_name: string
  file_sha256: string
  file_size: number
  account_number: string
  account_holder: string
  period_start: string
  period_end: string
  opening_balance: number | null
  closing_balance: number | null
  total_debits: number
  total_credits: number
  transaction_count: number
  balance_verified: boolean
  notes: string
  imported_at: string
  matched_count: number
  unmatched_count: number
  ignored_count: number
}
export type ReconciliationOverview = {
  statements: Array<{
    statement_id: string
    file_name: string
    period_start: string
    period_end: string
    account_id: string
    account_name: string
    total: number
    matched: number
    unrecorded: number
    ignored: number
    transfer: number
  }>
  unmatched_manual_count: number
  unreconciled_bank_count: number
}

// ---------------------------------------------------------------------------
// Statements (import wizard). Mirrors internal/services/statements.go.
// ---------------------------------------------------------------------------
export type PreviewStatement = {
  account_number: string
  account_holder: string
  currency: string
  period_start: string
  period_end: string
  opening_balance: number | null
  closing_balance: number | null
  total_debits: number
  total_credits: number
  transaction_count: number
}
export type PreviewTransaction = {
  line_no: number
  transaction_date: string
  value_date: string | null
  description: string
  reference: string
  debit: number
  credit: number
  balance: number | null
  fingerprint: string
  is_duplicate: boolean
  warnings: string[]
}
export type BalanceCheck = 'ok' | 'mismatch' | 'unavailable'
export type ImportValidation = {
  balance_check: BalanceCheck
  computed_closing: number | null
  difference: number
  messages: string[]
}
export type DuplicateStatement = {
  id: string
  file_name: string
  imported_at: string
  reason: 'sha256' | 'period' | 'fingerprints'
}
export type ImportPreview = {
  upload_token: string
  file_name: string
  file_sha256: string
  file_size: number
  provider: string
  account_id: string
  text_extraction: 'text' | 'none'
  statement: PreviewStatement
  transactions: PreviewTransaction[]
  validation: ImportValidation
  duplicate_statement: DuplicateStatement | null
  warnings: string[]
}
export type ImportRequest = {
  upload_token: string
  account_id: string
  force?: boolean
  skip_duplicates?: boolean
  statement: PreviewStatement
  transactions: PreviewTransaction[]
}
/** POST /statements/import response: the statement plus how many rows were skipped. */
export type ImportResult = Statement & { skipped_duplicates: number }

export type BankTransaction = {
  id: string
  statement_id: string
  account_id: string
  line_no: number
  transaction_date: string
  value_date: string | null
  description: string
  reference: string
  debit: number
  credit: number
  balance: number | null
  fingerprint: string
  created_at: string
}
export type ReconciliationRecordStatus = 'matched' | 'ignored' | 'transfer'
export type Reconciliation = {
  id: string
  bank_transaction_id: string
  transaction_id: string | null
  status: ReconciliationRecordStatus
  match_type: 'auto' | 'manual' | string
  rule: string
  confidence: number
  amount_diff: number
  date_diff_days: number
  note: string
  created_at: string
}
export type BankLineStatus = 'matched' | 'unrecorded' | 'ignored' | 'transfer'
export type BankTransactionWithStatus = BankTransaction & {
  status: BankLineStatus
  reconciliation: Reconciliation | null
  transaction: Transaction | null
}

// ---------------------------------------------------------------------------
// Reconciliation workspace. Mirrors internal/reconciliation/service.go.
// ---------------------------------------------------------------------------
export type SuggestionRule =
  'exact_date' | 'date_tolerance' | 'merchant_similarity' | 'description_similarity' | 'amount_mismatch'
export type Suggestion = {
  transaction_id: string
  transaction: Transaction | null
  rule: SuggestionRule
  confidence: number
  amount_diff: number
  date_diff_days: number
  reason: string
}
export type BankLine = BankTransactionWithStatus & { suggestions: Suggestion[] }
export type ManualLineStatus = 'matched' | 'unmatched' | 'possible_duplicate' | 'ignored' | 'transfer'
/**
 * A candidate manual transaction in the workspace. Note: the Go struct embeds
 * Transaction and shadows its `status`, so `status` here is the reconciliation
 * status and the ledger status (cleared/pending/void) is not in this payload.
 */
export type ManualLine = Omit<Transaction, 'status'> & { status: ManualLineStatus; duplicate_of?: string }
export type WorkspaceSummary = {
  total_debits: number
  total_credits: number
  manual_expenses: number
  manual_income: number
  matched: number
  unmatched_manual: number
  unrecorded_bank: number
  ignored: number
  transfers: number
  amount_discrepancies: number
  balance_verified: boolean
}
export type Workspace = {
  statement: Statement
  account: Account
  date_tolerance_days: number
  bank_transactions: BankLine[]
  manual_transactions: ManualLine[]
  summary: WorkspaceSummary
}

export type MatchRequest = { bank_transaction_id: string; transaction_id: string; note?: string }
export type BankLineRequest = { bank_transaction_id: string; note?: string }
export type MarkTransferRequest = {
  bank_transaction_id: string
  transaction_id?: string
  transfer_account_id?: string
}
export type CreateFromBankRequest = {
  bank_transaction_id: string
  category_id?: string
  payee?: string
  description?: string
  notes?: string
}
export type TransferResult = { reconciliation: Reconciliation; transaction: Transaction }
export type AdjustmentResult = TransferResult & { adjustment: Transaction }

// ---------------------------------------------------------------------------
// Reports additions. Mirrors internal/reports/service.go.
// ---------------------------------------------------------------------------
export type ReconciliationReport = {
  statement: Omit<Statement, 'matched_count' | 'unmatched_count' | 'ignored_count'>
  total_debits: number
  total_credits: number
  manual_expenses: number
  manual_income: number
  matched: number
  unmatched_manual: Transaction[]
  unrecorded_bank: BankTransaction[]
  amount_discrepancies: Array<{
    bank_transaction: BankTransaction
    transaction: Transaction
    difference: number
  }>
  balance: {
    opening: number | null
    closing: number | null
    computed_closing: number | null
    verified: boolean
  }
}
export type ExportReport =
  'summary' | 'categories' | 'cash-flow' | 'merchants' | 'accounts' | 'budgets' | 'reconciliation'
export type ExportFormat = 'csv' | 'pdf'
export type CashFlowGranularity = 'day' | 'week' | 'month'
export type FlowType = 'expense' | 'income'

// ---------------------------------------------------------------------------
// Authentication & multi-user. Mirrors docs/AUTH.md.
// ---------------------------------------------------------------------------
export type UserRole = 'admin' | 'user'
export type User = {
  id: string
  name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
  last_login_at: string | null
}
export type AuthStatus = { setup_required: boolean; registration_open: boolean; authenticated: boolean }
export type LoginRequest = { email: string; password: string }
export type SetupRequest = { name: string; email: string; password: string }
export type RegisterRequest = { name: string; email: string; password: string; invite_token?: string }
export type UpdateProfileRequest = { name?: string }
export type ChangePasswordRequest = { current_password: string; new_password: string }
export type AuthSession = {
  id: string
  created_at: string
  last_seen_at: string
  user_agent: string
  current: boolean
}

export type AdminUser = User & { account_count: number; transaction_count: number }
export type UpdateAdminUserRequest = { is_active?: boolean; role?: UserRole }
export type AdminSettings = { registration_open: boolean }
export type CreateInviteRequest = { email?: string; expires_in_hours?: number }
/** POST /admin/invites response: the token is only ever returned here. */
export type CreatedInvite = {
  id: string
  token: string
  email: string
  expires_at: string
  register_path: string
}
export type Invite = {
  id: string
  email: string
  created_at: string
  expires_at: string
  used_at: string | null
  used_by_email: string | null
}
