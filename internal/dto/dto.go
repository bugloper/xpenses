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
