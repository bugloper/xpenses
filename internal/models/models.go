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
	// Loan movements: money between an account and a loan. They change
	// account balances and what is owed, never income or expenses.
	TxLoanGiven             = "loan_given"              // the user lends: money out
	TxLoanReceived          = "loan_received"           // the user borrows: money in
	TxLoanRepayment         = "loan_repayment"          // the user pays back a loan: money out
	TxLoanRepaymentReceived = "loan_repayment_received" // someone pays the user back: money in
)

// Loan directions.
const (
	LoanGiven    = "given"
	LoanReceived = "received"
)

// LoanDirectionOf is the direction of loan a loan transaction type belongs
// to, "" for a type that is not a loan movement.
func LoanDirectionOf(txType string) string {
	switch txType {
	case TxLoanGiven, TxLoanRepaymentReceived:
		return LoanGiven
	case TxLoanReceived, TxLoanRepayment:
		return LoanReceived
	}
	return ""
}

// IsLoanRepayment is true for the two types that pay a loan down.
func IsLoanRepayment(txType string) bool {
	return txType == TxLoanRepayment || txType == TxLoanRepaymentReceived
}

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

// Receipt is the detail read from a payment app's success screen.
type Receipt struct {
	Bank        string `json:"bank"`
	Reference   string `json:"reference"`
	PaymentType string `json:"payment_type"`
	Date        string `json:"date"`
	Time        string `json:"time"`
}

// IsEmpty is true when no field is known.
func (r *Receipt) IsEmpty() bool {
	return r == nil || (r.Bank == "" && r.Reference == "" && r.PaymentType == "" && r.Date == "" && r.Time == "")
}

type Transaction struct {
	UserID              string   `json:"-"`
	ID                  string   `json:"id"`
	Type                string   `json:"type"`
	Amount              int64    `json:"amount"`
	Currency            string   `json:"currency"`
	AccountID           string   `json:"account_id"`
	AccountName         string   `json:"account_name,omitempty"`
	TransferAccountID   *string  `json:"transfer_account_id"`
	TransferAccountName string   `json:"transfer_account_name,omitempty"`
	CategoryID          *string  `json:"category_id"`
	CategoryName        string   `json:"category_name,omitempty"`
	CategoryIcon        string   `json:"category_icon,omitempty"`
	CategoryColor       string   `json:"category_color,omitempty"`
	Description         string   `json:"description"`
	Payee               string   `json:"payee"`
	TransactionDate     string   `json:"transaction_date"`
	Notes               string   `json:"notes"`
	Origin              string   `json:"origin"`
	Status              string   `json:"status"`
	RecurringID         *string  `json:"recurring_id"`
	ClientID            *string  `json:"client_id,omitempty"`
	Tags                []string `json:"tags"`
	// AttachmentMime is the stored image's media type, "" when none.
	AttachmentMime string `json:"-"`
	HasAttachment  bool   `json:"has_attachment"`
	// Receipt holds what the attached payment screenshot said; nil when nothing is known.
	Receipt *Receipt `json:"receipt"`
	// LoanID is the loan a loan movement (or an interest row) belongs to.
	LoanID           *string `json:"loan_id"`
	LoanCounterparty string  `json:"loan_counterparty,omitempty"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

// Loan is money lent or borrowed. The amounts after Notes are computed from
// cleared transactions, never stored.
type Loan struct {
	UserID        string  `json:"-"`
	ID            string  `json:"id"`
	Direction     string  `json:"direction"`
	Counterparty  string  `json:"counterparty"`
	OpeningAmount int64   `json:"opening_amount"`
	Currency      string  `json:"currency"`
	StartDate     string  `json:"start_date"`
	DueDate       *string `json:"due_date"`
	Notes         string  `json:"notes"`
	// Principal is opening_amount plus every amount lent or borrowed on it.
	Principal int64 `json:"principal"`
	// Repaid is the principal paid back so far.
	Repaid      int64 `json:"repaid"`
	Outstanding int64 `json:"outstanding"`
	// Interest is the interest paid (borrowed) or earned (lent) on it, kept
	// apart from principal.
	Interest         int64  `json:"interest"`
	TransactionCount int    `json:"transaction_count"`
	LastActivity     string `json:"last_activity"`
	// Status is open while anything is owed, settled once it is paid off.
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// Loan statuses (derived).
const (
	LoanOpen    = "open"
	LoanSettled = "settled"
)

// SavingsGoal is money set aside for something. Saved is the sum of its
// contributions less withdrawals: an allocation, not money in an account.
type SavingsGoal struct {
	UserID       string  `json:"-"`
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	TargetAmount int64   `json:"target_amount"`
	TargetDate   *string `json:"target_date"`
	AccountID    *string `json:"account_id"`
	AccountName  string  `json:"account_name,omitempty"`
	Notes        string  `json:"notes"`
	Saved        int64   `json:"saved"`
	// Pct is saved/target, 0-100 (capped), to one decimal.
	Pct       float64 `json:"pct"`
	Reached   bool    `json:"reached"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

// SavingsGoalEntry is one contribution (positive) or withdrawal (negative).
type SavingsGoalEntry struct {
	UserID        string  `json:"-"`
	ID            string  `json:"id"`
	GoalID        string  `json:"goal_id"`
	Amount        int64   `json:"amount"`
	EntryDate     string  `json:"entry_date"`
	Note          string  `json:"note"`
	TransactionID *string `json:"transaction_id"`
	CreatedAt     string  `json:"created_at"`
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
	// AvatarUpdatedAt is set while the user has a profile picture.
	AvatarUpdatedAt *string `json:"avatar_updated_at"`
	// AccessUntil is the last day (YYYY-MM-DD) the user may use the app: a
	// year from sign-up, extended by an administrator. Administrators are exempt.
	AccessUntil string `json:"access_until"`
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

// PasswordReset is an admin-issued, single-use link that lets a user choose
// a new password without knowing the old one.
type PasswordReset struct {
	ID        string  `json:"id"`
	UserID    string  `json:"user_id"`
	CreatedBy string  `json:"-"`
	CreatedAt string  `json:"created_at"`
	ExpiresAt string  `json:"expires_at"`
	UsedAt    *string `json:"used_at"`
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
