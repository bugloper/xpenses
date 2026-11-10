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

/**
 * Loan movements move money between an account and a loan: they change
 * balances and what is owed, never income or expenses.
 */
export type LoanTransactionType =
  'loan_given' | 'loan_received' | 'loan_repayment' | 'loan_repayment_received'
export const LOAN_TYPES: LoanTransactionType[] = [
  'loan_given',
  'loan_received',
  'loan_repayment',
  'loan_repayment_received',
]
export type TransactionType =
  'expense' | 'income' | 'transfer' | 'refund' | 'adjustment' | LoanTransactionType
export const TRANSACTION_TYPES: TransactionType[] = [
  'expense',
  'income',
  'transfer',
  'refund',
  'adjustment',
  ...LOAN_TYPES,
]
export type TransactionStatus = 'cleared' | 'pending' | 'void'
export type TransactionOrigin = 'manual' | 'imported' | 'adjustment'

/** Details read from a payment app's success screen. Every field may be ''. */
export type Receipt = {
  bank: string
  reference: string
  payment_type: string
  date: string
  time: string
}

/** POST /receipts/scan result: what OCR made of a screenshot (nothing stored). */
export type ScannedReceipt = {
  recognised: boolean
  bank: string
  amount: number
  journal_no: string
  from_account: string
  to_account: string
  payment_type: string
  date: string
  time: string
}

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
  has_attachment: boolean
  /** What the attached payment screenshot said; null when unknown. */
  receipt: Receipt | null
  status: TransactionStatus
  recurring_id: string | null
  client_id?: string | null
  tags: string[] | null
  /** The loan a loan movement (or an interest row) belongs to. */
  loan_id?: string | null
  loan_counterparty?: string
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
  receipt?: Receipt | null
  loan_id?: string | null
  /** Lending or borrowing may start a new loan instead of naming one. */
  new_loan?: { counterparty: string; due_date?: string | null } | null
  /** Interest paid or received with a repayment, on top of the principal amount. */
  interest?: number
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
  receipt?: Receipt | null
  clear_receipt?: boolean
  loan_id?: string
}

export type TransactionSort = 'date' | 'amount' | 'created_at' | 'payee'

export type TransactionFilter = {
  search?: string
  date_from?: string
  date_to?: string
  category_id?: string
  account_id?: string
  /** 'loan' matches every loan movement. */
  type?: TransactionType | 'loan'
  loan_id?: string
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
  pending_count: number
  recent_transactions: Transaction[]
}
export type ReportCategory = {
  category_id: string | null
  name: string
  icon: string
  color: string
  /** Set for a sub-category; reports roll up by parent. */
  parent_id: string | null
  parent_name: string
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
  /** Money borrowed, or repaid to the user. */
  loans_in: number
  /** Money lent, or paid back on what the user borrowed. */
  loans_out: number
}

export type ExportReport = 'summary' | 'categories' | 'cash-flow' | 'merchants' | 'accounts' | 'budgets'
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
  /** Set while the user has a profile picture; changes whenever it does. */
  avatar_updated_at: string | null
  /** Last day (YYYY-MM-DD) the user may use the app: a free year from sign-up, extended by an admin. Admins are exempt. */
  access_until: string
}
export type AuthStatus = { setup_required: boolean; registration_open: boolean; authenticated: boolean }
export type LoginRequest = { email: string; password: string }
export type SetupRequest = { name: string; email: string; password: string }
export type RegisterRequest = { name: string; email: string; password: string; invite_token?: string }
export type UpdateProfileRequest = { name?: string }
export type ChangePasswordRequest = { current_password: string; new_password: string }
export type ResetPasswordRequest = { token: string; new_password: string }
/** POST /admin/users/:id/password-reset response: the token is only ever returned here. */
export type CreatedPasswordReset = {
  id: string
  user_id: string
  expires_at: string
  token: string
  reset_path: string
}
export type AuthSession = {
  id: string
  created_at: string
  last_seen_at: string
  user_agent: string
  current: boolean
}

export type AdminUser = User & { account_count: number; transaction_count: number }
export type UpdateAdminUserRequest = { is_active?: boolean; role?: UserRole; access_until?: string }
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

/** GET /accounts/:id/usage — an account can be deleted only when both are 0. */
export interface AccountUsage {
  transactions: number
  recurring: number
}

/** GET /categories/:id/usage — counts include the sub-categories of a main category. */
export interface CategoryUsage {
  sub_categories: number
  transactions: number
  budgets: number
  recurring: number
}

// Feedback & support, and testimonials (see internal/services/community.go).
export type FeedbackKindKey = 'feedback' | 'feature' | 'support'
export type FeedbackStatus = 'new' | 'acknowledged' | 'replied'

export interface FeedbackMessage {
  id: string
  kind: FeedbackKindKey
  kind_label: string
  body: string
  status: FeedbackStatus
  /** The administrator's answer; empty until there is one. */
  reply: string
  created_at: string
  acknowledged_at: string | null
  replied_at: string | null
}

export interface MyFeedback {
  kinds: { key: FeedbackKindKey; label: string }[]
  messages: FeedbackMessage[]
}

export interface CommunitySender {
  id: string
  name: string
  email: string
}

export interface AdminFeedbackMessage extends FeedbackMessage {
  from: CommunitySender
  reviewed_by_name: string | null
}

export type TestimonialStatus = 'pending' | 'approved' | 'hidden'

export interface Testimonial {
  id: string
  body: string
  status: TestimonialStatus
  updated_at: string
}

export interface PublicTestimonial {
  id: string
  body: string
  name: string
  /** YYYY-MM the writer started using Xpenses. */
  since: string
}

export interface AdminTestimonial extends Testimonial {
  from: CommunitySender
  reviewed_by_name: string | null
  reviewed_at: string | null
}

export interface CommunityCounts {
  new_feedback: number
  pending_testimonials: number
}

// ---------------------------------------------------------------------------
// Loans and savings goals.
// ---------------------------------------------------------------------------
export type LoanDirection = 'given' | 'received'
export type Loan = {
  id: string
  direction: LoanDirection
  counterparty: string
  /** Owed before the loan was recorded here; no money moved in the app. */
  opening_amount: number
  currency: string
  start_date: string
  due_date: string | null
  notes: string
  /** Opening amount plus everything lent or borrowed on it. */
  principal: number
  repaid: number
  outstanding: number
  /** Interest paid (borrowed) or earned (lent), kept apart from principal. */
  interest: number
  transaction_count: number
  last_activity: string
  status: 'open' | 'settled'
  created_at: string
  updated_at: string
}
export type CreateLoanRequest = {
  direction: LoanDirection
  counterparty: string
  opening_amount: number
  start_date?: string
  due_date?: string | null
  notes?: string
}
export type UpdateLoanRequest = {
  counterparty?: string
  opening_amount?: number
  start_date?: string
  due_date?: string
  clear_due_date?: boolean
  notes?: string
}

export type SavingsGoal = {
  id: string
  name: string
  target_amount: number
  target_date: string | null
  /** Where the goal's money is kept, when the user says. */
  account_id: string | null
  account_name?: string
  notes: string
  /** Contributions less withdrawals: set aside, not a separate balance. */
  saved: number
  pct: number
  reached: boolean
  created_at: string
  updated_at: string
}
export type SavingsGoalEntry = {
  id: string
  goal_id: string
  /** Positive: a contribution; negative: a withdrawal. */
  amount: number
  entry_date: string
  note: string
  /** The transfer that moved the money, when the entry moved any. */
  transaction_id: string | null
  created_at: string
}
export type SavingsGoalDetail = SavingsGoal & { entries: SavingsGoalEntry[] }
export type SavingsGoalRequest = {
  name?: string
  target_amount?: number
  target_date?: string | null
  clear_target_date?: boolean
  account_id?: string | null
  clear_account?: boolean
  notes?: string
}
export type SavingsGoalEntryRequest = {
  amount: number
  entry_date?: string
  note?: string
  from_account_id?: string | null
  to_account_id?: string | null
}

/** GET /reports/loans: one month of money moving on loans (never income or expense). */
export type ReportLoanActivity = {
  period: string
  lent: number
  repaid_to_you: number
  borrowed: number
  you_repaid: number
  interest_paid: number
  interest_earned: number
}
/** GET /reports/savings: one month of goal contributions and withdrawals. */
export type ReportSavingsActivity = { period: string; added: number; taken: number }
