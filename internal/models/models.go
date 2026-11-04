// Package models holds the persistent domain types. All monetary fields are
// integer minor units.
package models

// Account types.
const (
	AccountBank         = "bank"
	AccountCash         = "cash"
	AccountMobileWallet = "mobile_wallet"
	AccountCreditCard   = "credit_card"
	AccountSavings      = "savings"
)

// Transaction types.
const (
	TxExpense    = "expense"
	TxIncome     = "income"
	TxTransfer   = "transfer"
	TxRefund     = "refund"
	TxAdjustment = "adjustment"
)

// Transaction origins.
const (
	OriginManual     = "manual"
	OriginImported   = "imported"
	OriginAdjustment = "adjustment"
)

// Transaction statuses.
const (
	StatusCleared = "cleared"
	StatusPending = "pending"
	StatusVoid    = "void"
)

// Reconciliation statuses stored in the reconciliations table.
const (
	ReconMatched  = "matched"
	ReconIgnored  = "ignored"
	ReconTransfer = "transfer"
)

type Account struct {
	UserID             string `json:"-"`
	ID                 string `json:"id"`
	Name               string `json:"name"`
	Type               string `json:"type"`
	Currency           string `json:"currency"`
	OpeningBalance     int64  `json:"opening_balance"`
	OpeningBalanceDate string `json:"opening_balance_date"`
	AccountNumber      string `json:"account_number"`
	IsActive           bool   `json:"is_active"`
	CurrentBalance     int64  `json:"current_balance"`
	CreatedAt          string `json:"created_at"`
	UpdatedAt          string `json:"updated_at"`
}

type Category struct {
	UserID    string  `json:"-"`
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Icon      string  `json:"icon"`
	Color     string  `json:"color"`
	Type      string  `json:"type"`
	ParentID  *string `json:"parent_id"`
	IsActive  bool    `json:"is_active"`
	IsSystem  bool    `json:"is_system"`
	SortOrder int     `json:"sort_order"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

// Payee is a distinct payee the user has saved, with what was last used alongside it.
type Payee struct {
	Name           string  `json:"name"`
	Count          int     `json:"count"`
	LastUsed       string  `json:"last_used"`
	LastCategoryID *string `json:"last_category_id"`
	LastAccountID  *string `json:"last_account_id"`
}

type Transaction struct {
	UserID                  string   `json:"-"`
	ID                      string   `json:"id"`
	Type                    string   `json:"type"`
	Amount                  int64    `json:"amount"`
	Currency                string   `json:"currency"`
	AccountID               string   `json:"account_id"`
	AccountName             string   `json:"account_name,omitempty"`
	TransferAccountID       *string  `json:"transfer_account_id"`
	TransferAccountName     string   `json:"transfer_account_name,omitempty"`
	CategoryID              *string  `json:"category_id"`
	CategoryName            string   `json:"category_name,omitempty"`
	CategoryIcon            string   `json:"category_icon,omitempty"`
	CategoryColor           string   `json:"category_color,omitempty"`
	Description             string   `json:"description"`
	Payee                   string   `json:"payee"`
	TransactionDate         string   `json:"transaction_date"`
	Notes                   string   `json:"notes"`
	Origin                  string   `json:"origin"`
	Status                  string   `json:"status"`
	RecurringID             *string  `json:"recurring_id"`
	SourceBankTransactionID *string  `json:"source_bank_transaction_id"`
	ClientID                *string  `json:"client_id,omitempty"`
	Tags                    []string `json:"tags"`
	// Reconciliation summary (populated by list/get).
	ReconciliationStatus string  `json:"reconciliation_status,omitempty"`
	BankTransactionID    *string `json:"bank_transaction_id,omitempty"`
	CreatedAt            string  `json:"created_at"`
	UpdatedAt            string  `json:"updated_at"`
}

type RecurringTransaction struct {
	UserID            string  `json:"-"`
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Type              string  `json:"type"`
	Amount            int64   `json:"amount"`
	Currency          string  `json:"currency"`
	AccountID         string  `json:"account_id"`
	TransferAccountID *string `json:"transfer_account_id"`
	CategoryID        *string `json:"category_id"`
	Description       string  `json:"description"`
	Payee             string  `json:"payee"`
	Frequency         string  `json:"frequency"`
	Interval          int     `json:"interval"`
	StartDate         string  `json:"start_date"`
	EndDate           *string `json:"end_date"`
	NextRunDate       string  `json:"next_run_date"`
	GenerateAs        string  `json:"generate_as"`
	IsActive          bool    `json:"is_active"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

type Budget struct {
	UserID     string `json:"-"`
	ID         string `json:"id"`
	CategoryID string `json:"category_id"`
	Amount     int64  `json:"amount"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

type BankStatement struct {
	UserID           string `json:"-"`
	ID               string `json:"id"`
	Provider         string `json:"provider"`
	AccountID        string `json:"account_id"`
	FileName         string `json:"file_name"`
	FileSHA256       string `json:"file_sha256"`
	FileSize         int64  `json:"file_size"`
	AccountNumber    string `json:"account_number"`
	AccountHolder    string `json:"account_holder"`
	PeriodStart      string `json:"period_start"`
	PeriodEnd        string `json:"period_end"`
	OpeningBalance   *int64 `json:"opening_balance"`
	ClosingBalance   *int64 `json:"closing_balance"`
	TotalDebits      int64  `json:"total_debits"`
	TotalCredits     int64  `json:"total_credits"`
	TransactionCount int    `json:"transaction_count"`
	BalanceVerified  bool   `json:"balance_verified"`
	Notes            string `json:"notes"`
	ImportedAt       string `json:"imported_at"`
}

type BankTransaction struct {
	UserID          string  `json:"-"`
	ID              string  `json:"id"`
	StatementID     string  `json:"statement_id"`
	AccountID       string  `json:"account_id"`
	LineNo          int     `json:"line_no"`
	TransactionDate string  `json:"transaction_date"`
	ValueDate       *string `json:"value_date"`
	Description     string  `json:"description"`
	Reference       string  `json:"reference"`
	Debit           int64   `json:"debit"`
	Credit          int64   `json:"credit"`
	Balance         *int64  `json:"balance"`
	Fingerprint     string  `json:"fingerprint"`
	CreatedAt       string  `json:"created_at"`
}

type Reconciliation struct {
	UserID            string  `json:"-"`
	ID                string  `json:"id"`
	BankTransactionID string  `json:"bank_transaction_id"`
	TransactionID     *string `json:"transaction_id"`
	Status            string  `json:"status"`
	MatchType         string  `json:"match_type"`
	Rule              string  `json:"rule"`
	Confidence        int     `json:"confidence"`
	AmountDiff        int64   `json:"amount_diff"`
	DateDiffDays      int     `json:"date_diff_days"`
	Note              string  `json:"note"`
	CreatedAt         string  `json:"created_at"`
}

// User roles.
const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

type User struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	Role        string  `json:"role"`
	IsActive    bool    `json:"is_active"`
	LastLoginAt *string `json:"last_login_at"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
	// PasswordHash is never serialised.
	PasswordHash string `json:"-"`
}

type Session struct {
	ID         string `json:"id"`
	UserID     string `json:"-"`
	CreatedAt  string `json:"created_at"`
	LastSeenAt string `json:"last_seen_at"`
	ExpiresAt  string `json:"-"`
	UserAgent  string `json:"user_agent"`
	IP         string `json:"-"`
	Current    bool   `json:"current"`
}

type Invite struct {
	ID          string  `json:"id"`
	Email       string  `json:"email"`
	CreatedBy   string  `json:"-"`
	CreatedAt   string  `json:"created_at"`
	ExpiresAt   string  `json:"expires_at"`
	UsedAt      *string `json:"used_at"`
	UsedByEmail *string `json:"used_by_email"`
}
