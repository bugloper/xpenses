// Package dto defines request/response shapes for the REST API.
package dto

// Pagination describes a page of results.
type Pagination struct {
	Page    int `json:"page"`
	PerPage int `json:"per_page"`
	Total   int `json:"total"`
}

// Page is the envelope for paginated list responses.
type Page[T any] struct {
	Data []T        `json:"data"`
	Meta Pagination `json:"meta"`
}

// ErrorResponse is the consistent error envelope.
type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}

type ErrorBody struct {
	Code      string            `json:"code"`
	Message   string            `json:"message"`
	Details   map[string]string `json:"details,omitempty"`
	RequestID string            `json:"request_id,omitempty"`
}

type CreateAccountRequest struct {
	Name               string `json:"name"`
	Type               string `json:"type"`
	Currency           string `json:"currency"`
	OpeningBalance     int64  `json:"opening_balance"`
	OpeningBalanceDate string `json:"opening_balance_date"`
	AccountNumber      string `json:"account_number"`
}

type UpdateAccountRequest struct {
	Name               *string `json:"name"`
	Type               *string `json:"type"`
	Currency           *string `json:"currency"`
	OpeningBalance     *int64  `json:"opening_balance"`
	OpeningBalanceDate *string `json:"opening_balance_date"`
	AccountNumber      *string `json:"account_number"`
	IsActive           *bool   `json:"is_active"`
}

type CreateCategoryRequest struct {
	Name     string  `json:"name"`
	Icon     string  `json:"icon"`
	Color    string  `json:"color"`
	Type     string  `json:"type"`
	ParentID *string `json:"parent_id"`
}

type UpdateCategoryRequest struct {
	Name      *string `json:"name"`
	Icon      *string `json:"icon"`
	Color     *string `json:"color"`
	ParentID  *string `json:"parent_id"`
	IsActive  *bool   `json:"is_active"`
	SortOrder *int    `json:"sort_order"`
}

// Receipt is what a payment app's success screen said; every field optional.
type Receipt struct {
	Bank        string `json:"bank"`
	Reference   string `json:"reference"`
	PaymentType string `json:"payment_type"`
	Date        string `json:"date"`
	Time        string `json:"time"`
}

type CreateTransactionRequest struct {
	Type              string   `json:"type"`
	Amount            int64    `json:"amount"`
	Currency          string   `json:"currency"`
	AccountID         string   `json:"account_id"`
	TransferAccountID *string  `json:"transfer_account_id"`
	CategoryID        *string  `json:"category_id"`
	Description       string   `json:"description"`
	Payee             string   `json:"payee"`
	TransactionDate   string   `json:"transaction_date"`
	Notes             string   `json:"notes"`
	Tags              []string `json:"tags"`
	Status            string   `json:"status"`
	// ClientID is an optional client-generated id used by the offline queue so
	// that a retried POST is idempotent.
	ClientID *string `json:"client_id"`
	// Receipt carries the details read from an attached payment screenshot.
	Receipt *Receipt `json:"receipt"`
	// LoanID is the loan a loan movement belongs to. Lending or borrowing may
	// instead start a new loan with NewLoan.
	LoanID  *string  `json:"loan_id"`
	NewLoan *NewLoan `json:"new_loan"`
	// Interest paid or received with a repayment, on top of Amount (which is
	// principal only). It is recorded as its own expense or income.
	Interest int64 `json:"interest"`
}

// NewLoan starts a loan from the transaction that lends or borrows its money.
type NewLoan struct {
	Counterparty string  `json:"counterparty"`
	DueDate      *string `json:"due_date"`
}

type UpdateTransactionRequest struct {
	Type              *string   `json:"type"`
	Amount            *int64    `json:"amount"`
	Currency          *string   `json:"currency"`
	AccountID         *string   `json:"account_id"`
	TransferAccountID *string   `json:"transfer_account_id"`
	CategoryID        *string   `json:"category_id"`
	Description       *string   `json:"description"`
	Payee             *string   `json:"payee"`
	TransactionDate   *string   `json:"transaction_date"`
	Notes             *string   `json:"notes"`
	Tags              *[]string `json:"tags"`
	Status            *string   `json:"status"`
	// Set to true to clear the category / transfer account explicitly.
	ClearCategory        bool `json:"clear_category"`
	ClearTransferAccount bool `json:"clear_transfer_account"`
	// Receipt replaces the stored receipt details; ClearReceipt drops them.
	Receipt      *Receipt `json:"receipt"`
	ClearReceipt bool     `json:"clear_receipt"`
	// LoanID moves a loan movement to another loan of the same direction.
	LoanID *string `json:"loan_id"`
}

// TransactionFilter is the query model for GET /transactions.
type TransactionFilter struct {
	// UserID scopes the query; it is set by the service, never from the client.
	UserID     string
	Search     string
	DateFrom   string
	DateTo     string
	CategoryID string
	AccountID  string
	Type       string
	LoanID     string
	Status     string
	Origin     string
	Unmatched  bool
	Sort       string
	Order      string
	Page       int
	PerPage    int
}

type CreateBudgetRequest struct {
	CategoryID string `json:"category_id"`
	Amount     int64  `json:"amount"`
}

type UpdateBudgetRequest struct {
	Amount *int64 `json:"amount"`
}

type CreateRecurringRequest struct {
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
	GenerateAs        string  `json:"generate_as"`
}

type UpdateRecurringRequest struct {
	Name              *string `json:"name"`
	Amount            *int64  `json:"amount"`
	AccountID         *string `json:"account_id"`
	TransferAccountID *string `json:"transfer_account_id"`
	CategoryID        *string `json:"category_id"`
	Description       *string `json:"description"`
	Payee             *string `json:"payee"`
	Frequency         *string `json:"frequency"`
	Interval          *int    `json:"interval"`
	EndDate           *string `json:"end_date"`
	NextRunDate       *string `json:"next_run_date"`
	GenerateAs        *string `json:"generate_as"`
	IsActive          *bool   `json:"is_active"`
}

type UpdateSettingsRequest map[string]string

type CreateLoanRequest struct {
	Direction     string  `json:"direction"`
	Counterparty  string  `json:"counterparty"`
	OpeningAmount int64   `json:"opening_amount"`
	Currency      string  `json:"currency"`
	StartDate     string  `json:"start_date"`
	DueDate       *string `json:"due_date"`
	Notes         string  `json:"notes"`
}

type UpdateLoanRequest struct {
	Counterparty  *string `json:"counterparty"`
	OpeningAmount *int64  `json:"opening_amount"`
	StartDate     *string `json:"start_date"`
	DueDate       *string `json:"due_date"`
	ClearDueDate  bool    `json:"clear_due_date"`
	Notes         *string `json:"notes"`
}

type CreateSavingsGoalRequest struct {
	Name         string  `json:"name"`
	TargetAmount int64   `json:"target_amount"`
	TargetDate   *string `json:"target_date"`
	AccountID    *string `json:"account_id"`
	Notes        string  `json:"notes"`
}

type UpdateSavingsGoalRequest struct {
	Name            *string `json:"name"`
	TargetAmount    *int64  `json:"target_amount"`
	TargetDate      *string `json:"target_date"`
	ClearTargetDate bool    `json:"clear_target_date"`
	AccountID       *string `json:"account_id"`
	ClearAccount    bool    `json:"clear_account"`
	Notes           *string `json:"notes"`
}

// SavingsGoalEntryRequest adds to a goal (positive amount) or takes from it
// (negative). FromAccountID on a contribution, or ToAccountID on a
// withdrawal, also moves the money by a transfer to or from the goal's
// account.
type SavingsGoalEntryRequest struct {
	Amount        int64   `json:"amount"`
	EntryDate     string  `json:"entry_date"`
	Note          string  `json:"note"`
	FromAccountID *string `json:"from_account_id"`
	ToAccountID   *string `json:"to_account_id"`
}
