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
