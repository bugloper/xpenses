package reports

import (
	"context"
	"database/sql"
	"errors"
	"math"

	"github.com/bugloper/xpensiv/internal/auth"
	"github.com/bugloper/xpensiv/internal/dto"
	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/repositories"
)

// Service answers report queries over the ledger. Every report counts only
// cleared transactions and never treats a transfer as income or expense.
// "Income" is income + refund; "expenses" is expense only.
//
// Every query is scoped to auth.UserID(ctx). Joins onto categories/accounts
// repeat the user predicate (c.user_id = t.user_id) rather than relying on
// the FK alone: the FK only guarantees the referenced row exists, not that it
// belongs to the same user, so a stray cross-user reference can never pull
// another user's names or colours into a report.
type Service struct {
	db       *sql.DB
	accounts repositories.AccountRepo
	txs      repositories.TransactionRepo
}

func NewService(db *sql.DB) *Service { return &Service{db: db} }

// PeriodTotals are the income/expense totals of a period.
type PeriodTotals struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Income   int64  `json:"income"`
	Expenses int64  `json:"expenses"`
	Net      int64  `json:"net"`
}

type Summary struct {
	TotalBalance          int64                `json:"total_balance"`
	Income                int64                `json:"income"`
	Expenses              int64                `json:"expenses"`
	Net                   int64                `json:"net"`
	Previous              PeriodTotals         `json:"previous"`
	ExpenseChangePct      *float64             `json:"expense_change_pct"`
	UnreconciledBankCount int                  `json:"unreconciled_bank_count"`
	UnmatchedManualCount  int                  `json:"unmatched_manual_count"`
	PendingCount          int                  `json:"pending_count"`
	RecentTransactions    []models.Transaction `json:"recent_transactions"`
}

type CategoryRow struct {
	CategoryID *string `json:"category_id"`
	Name       string  `json:"name"`
	Icon       string  `json:"icon"`
	Color      string  `json:"color"`
	Amount     int64   `json:"amount"`
	Count      int     `json:"count"`
	Pct        float64 `json:"pct"`
}

type CashFlowRow struct {
	Period   string `json:"period"`
	Income   int64  `json:"income"`
	Expenses int64  `json:"expenses"`
	Net      int64  `json:"net"`
}

type MerchantRow struct {
	Payee  string `json:"payee"`
	Amount int64  `json:"amount"`
	Count  int    `json:"count"`
}

type AccountRow struct {
	AccountID      string `json:"account_id"`
	Name           string `json:"name"`
	Type           string `json:"type"`
	Currency       string `json:"currency"`
	OpeningBalance int64  `json:"opening_balance"`
	Balance        int64  `json:"balance"`
	Income         int64  `json:"income"`
	Expenses       int64  `json:"expenses"`
	TransfersIn    int64  `json:"transfers_in"`
	TransfersOut   int64  `json:"transfers_out"`
}

type BudgetRow struct {
	BudgetID   string `json:"budget_id"`
	CategoryID string `json:"category_id"`
	Name       string `json:"name"`
	Icon       string `json:"icon"`
	Color      string `json:"color"`
	Amount     int64  `json:"amount"`
	Spent      int64  `json:"spent"`
	Remaining  int64  `json:"remaining"`
	Pct        int    `json:"pct"`
	Level      string `json:"level"`
}

// Budget levels.
const (
	LevelOK     = "ok"
	LevelWarn75 = "warn75"
	LevelWarn90 = "warn90"
	LevelOver   = "over"
)

type Discrepancy struct {
	BankTransaction models.BankTransaction `json:"bank_transaction"`
	Transaction     models.Transaction     `json:"transaction"`
	Difference      int64                  `json:"difference"`
}

type BalanceCheck struct {
	Opening         *int64 `json:"opening"`
	Closing         *int64 `json:"closing"`
	ComputedClosing *int64 `json:"computed_closing"`
	Verified        bool   `json:"verified"`
}

type ReconciliationReport struct {
	Statement           models.BankStatement     `json:"statement"`
	TotalDebits         int64                    `json:"total_debits"`
	TotalCredits        int64                    `json:"total_credits"`
	ManualExpenses      int64                    `json:"manual_expenses"`
	ManualIncome        int64                    `json:"manual_income"`
	Matched             int                      `json:"matched"`
	UnmatchedManual     []models.Transaction     `json:"unmatched_manual"`
	UnrecordedBank      []models.BankTransaction `json:"unrecorded_bank"`
	AmountDiscrepancies []Discrepancy            `json:"amount_discrepancies"`
	Balance             BalanceCheck             `json:"balance"`
}

// BudgetLevel classifies spend against a budget.
func BudgetLevel(pct int) string {
	switch {
	case pct >= 100:
		return LevelOver
	case pct >= 90:
		return LevelWarn90
	case pct >= 75:
		return LevelWarn75
	}
	return LevelOK
}

// ExpenseChangePct is (cur-prev)/prev*100 to one decimal, nil when prev is 0.
func ExpenseChangePct(cur, prev int64) *float64 {
	if prev == 0 {
		return nil
	}
	v := math.Round(float64(cur-prev)*1000/float64(prev)) / 10
	return &v
}

// flowFilter is the SQL predicate for the given flow type.
func flowFilter(typ string) string {
	if typ == FlowIncome {
		return `t.type IN ('income','refund')`
	}
	return `t.type = 'expense'`
}

func (s *Service) totals(ctx context.Context, p Period) (PeriodTotals, error) {
	out := PeriodTotals{From: p.From, To: p.To}
	err := s.db.QueryRowContext(ctx, `SELECT
		COALESCE(SUM(CASE WHEN t.type IN ('income','refund') THEN t.amount ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
		FROM transactions t WHERE t.user_id = ? AND t.status = 'cleared' AND t.transaction_date BETWEEN ? AND ?`,
		auth.UserID(ctx), p.From, p.To).Scan(&out.Income, &out.Expenses)
	out.Net = out.Income - out.Expenses
	return out, err
}

func (s *Service) Summary(ctx context.Context, p Period) (*Summary, error) {
	cur, err := s.totals(ctx, p)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	prev, err := s.totals(ctx, p.Previous())
	if err != nil {
		return nil, apperr.Internal(err)
	}
	out := &Summary{Income: cur.Income, Expenses: cur.Expenses, Net: cur.Net, Previous: prev,
		ExpenseChangePct: ExpenseChangePct(cur.Expenses, prev.Expenses)}
	if out.TotalBalance, err = s.accounts.TotalBalance(ctx, s.db, auth.UserID(ctx)); err != nil {
		return nil, apperr.Internal(err)
	}
	uid := auth.UserID(ctx)
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bank_transactions bt
		LEFT JOIN reconciliations r ON r.bank_transaction_id = bt.id AND r.user_id = bt.user_id
		WHERE bt.user_id = ? AND r.id IS NULL`, uid).Scan(&out.UnreconciledBankCount); err != nil {
		return nil, apperr.Internal(err)
	}
	if out.UnmatchedManualCount, err = s.txs.CountUnmatchedManual(ctx, s.db, uid); err != nil {
		return nil, apperr.Internal(err)
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM transactions WHERE user_id = ? AND status = 'pending'`, uid).Scan(&out.PendingCount); err != nil {
		return nil, apperr.Internal(err)
	}
	recent, _, err := s.txs.List(ctx, s.db, dto.TransactionFilter{UserID: uid, Sort: "date", Order: "desc", Page: 1, PerPage: 10})
	if err != nil {
		return nil, apperr.Internal(err)
	}
	out.RecentTransactions = recent
	return out, nil
}

func (s *Service) Categories(ctx context.Context, p Period, typ string) ([]CategoryRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT t.category_id, COALESCE(c.name, 'Uncategorised'),
		COALESCE(c.icon, 'circle'), COALESCE(c.color, '#64748b'), SUM(t.amount), COUNT(*)
		FROM transactions t LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
		WHERE t.user_id = ? AND t.status = 'cleared' AND `+flowFilter(typ)+` AND t.transaction_date BETWEEN ? AND ?
		GROUP BY t.category_id ORDER BY SUM(t.amount) DESC, c.name`, auth.UserID(ctx), p.From, p.To)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	out := []CategoryRow{}
	var total int64
	for rows.Next() {
		var r CategoryRow
		var id sql.NullString
		if err := rows.Scan(&id, &r.Name, &r.Icon, &r.Color, &r.Amount, &r.Count); err != nil {
			return nil, apperr.Internal(err)
		}
		if id.Valid {
			v := id.String
			r.CategoryID = &v
		}
		total += r.Amount
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	for i := range out {
		out[i].Pct = pct(out[i].Amount, total)
	}
	return out, nil
}

// CashFlow aggregates per day in SQL and buckets in Go so week/month labels
// are deterministic and every bucket in the range is present.
func (s *Service) CashFlow(ctx context.Context, p Period, granularity string) ([]CashFlowRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT t.transaction_date,
		COALESCE(SUM(CASE WHEN t.type IN ('income','refund') THEN t.amount ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
		FROM transactions t WHERE t.user_id = ? AND t.status = 'cleared' AND t.transaction_date BETWEEN ? AND ?
		GROUP BY t.transaction_date`, auth.UserID(ctx), p.From, p.To)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	keys := p.Buckets(granularity)
	idx := make(map[string]int, len(keys))
	out := make([]CashFlowRow, len(keys))
	for i, k := range keys {
		idx[k] = i
		out[i].Period = k
	}
	for rows.Next() {
		var date string
		var income, expenses int64
		if err := rows.Scan(&date, &income, &expenses); err != nil {
			return nil, apperr.Internal(err)
		}
		d, err := models.ParseDate(date)
		if err != nil {
			continue // malformed stored date: cannot be bucketed
		}
		i, ok := idx[BucketKey(d, granularity)]
		if !ok {
			continue
		}
		out[i].Income += income
		out[i].Expenses += expenses
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	for i := range out {
		out[i].Net = out[i].Income - out[i].Expenses
	}
	return out, nil
}

func (s *Service) Merchants(ctx context.Context, p Period, typ string) ([]MerchantRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT CASE WHEN TRIM(t.payee) = '' THEN '(no payee)' ELSE t.payee END AS payee,
		SUM(t.amount), COUNT(*)
		FROM transactions t WHERE t.user_id = ? AND t.status = 'cleared' AND `+flowFilter(typ)+` AND t.transaction_date BETWEEN ? AND ?
		GROUP BY payee ORDER BY SUM(t.amount) DESC, payee LIMIT 50`, auth.UserID(ctx), p.From, p.To)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	out := []MerchantRow{}
	for rows.Next() {
		var r MerchantRow
		if err := rows.Scan(&r.Payee, &r.Amount, &r.Count); err != nil {
			return nil, apperr.Internal(err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

// Accounts reports period activity per active account. Here adjustments do
// count (positive as income, negative as expenses) because the point of this
// report is to explain the balance movement of each account.
func (s *Service) Accounts(ctx context.Context, p Period) ([]AccountRow, error) {
	uid := auth.UserID(ctx)
	accts, err := s.accounts.List(ctx, s.db, uid, false)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	out := make([]AccountRow, len(accts))
	idx := make(map[string]int, len(accts))
	for i, a := range accts {
		idx[a.ID] = i
		out[i] = AccountRow{AccountID: a.ID, Name: a.Name, Type: a.Type, Currency: a.Currency,
			OpeningBalance: a.OpeningBalance, Balance: a.CurrentBalance}
	}
	rows, err := s.db.QueryContext(ctx, `SELECT t.account_id,
		COALESCE(SUM(CASE WHEN t.type IN ('income','refund') OR (t.type = 'adjustment' AND t.amount > 0) THEN t.amount ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount WHEN t.type = 'adjustment' AND t.amount < 0 THEN -t.amount ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN t.type = 'transfer' THEN t.amount ELSE 0 END), 0)
		FROM transactions t WHERE t.user_id = ? AND t.status = 'cleared' AND t.transaction_date BETWEEN ? AND ?
		GROUP BY t.account_id`, uid, p.From, p.To)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var income, expenses, transfersOut int64
		if err := rows.Scan(&id, &income, &expenses, &transfersOut); err != nil {
			return nil, apperr.Internal(err)
		}
		if i, ok := idx[id]; ok {
			out[i].Income, out[i].Expenses, out[i].TransfersOut = income, expenses, transfersOut
		}
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	in, err := s.db.QueryContext(ctx, `SELECT t.transfer_account_id, COALESCE(SUM(t.amount), 0)
		FROM transactions t WHERE t.user_id = ? AND t.status = 'cleared' AND t.type = 'transfer' AND t.transaction_date BETWEEN ? AND ?
		GROUP BY t.transfer_account_id`, uid, p.From, p.To)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer in.Close()
	for in.Next() {
		var id string
		var amount int64
		if err := in.Scan(&id, &amount); err != nil {
			return nil, apperr.Internal(err)
		}
		if i, ok := idx[id]; ok {
			out[i].TransfersIn = amount
		}
	}
	if err := in.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

// Budgets reports spend against every budget for the calendar month. Spend is
// cleared expenses in the budget's category or its direct children.
func (s *Service) Budgets(ctx context.Context, month Period) ([]BudgetRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT b.id, b.category_id, c.name, c.icon, c.color, b.amount,
		COALESCE((SELECT SUM(t.amount) FROM transactions t
			WHERE t.user_id = b.user_id AND t.status = 'cleared' AND t.type = 'expense' AND t.transaction_date BETWEEN ? AND ?
			AND (t.category_id = b.category_id
				OR t.category_id IN (SELECT ch.id FROM categories ch WHERE ch.user_id = b.user_id AND ch.parent_id = b.category_id))), 0)
		FROM budgets b JOIN categories c ON c.id = b.category_id AND c.user_id = b.user_id
		WHERE b.user_id = ?
		ORDER BY c.sort_order, c.name`, month.From, month.To, auth.UserID(ctx))
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	out := []BudgetRow{}
	for rows.Next() {
		var r BudgetRow
		if err := rows.Scan(&r.BudgetID, &r.CategoryID, &r.Name, &r.Icon, &r.Color, &r.Amount, &r.Spent); err != nil {
			return nil, apperr.Internal(err)
		}
		r.Remaining = r.Amount - r.Spent
		r.Pct = intPct(r.Spent, r.Amount)
		r.Level = BudgetLevel(r.Pct)
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

func (s *Service) Reconciliation(ctx context.Context, statementID string) (*ReconciliationReport, error) {
	uid := auth.UserID(ctx)
	var st models.BankStatement
	var opening, closing sql.NullInt64
	var verified int
	// Another user's statement is indistinguishable from a missing one: 404.
	err := s.db.QueryRowContext(ctx, `SELECT id, provider, account_id, file_name, file_sha256, file_size, account_number,
		account_holder, period_start, period_end, opening_balance, closing_balance, total_debits, total_credits,
		transaction_count, balance_verified, notes, imported_at FROM bank_statements WHERE id = ? AND user_id = ?`, statementID, uid).
		Scan(&st.ID, &st.Provider, &st.AccountID, &st.FileName, &st.FileSHA256, &st.FileSize, &st.AccountNumber,
			&st.AccountHolder, &st.PeriodStart, &st.PeriodEnd, &opening, &closing, &st.TotalDebits, &st.TotalCredits,
			&st.TransactionCount, &verified, &st.Notes, &st.ImportedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.NotFound("statement")
	}
	if err != nil {
		return nil, apperr.Internal(err)
	}
	st.BalanceVerified = verified == 1
	if opening.Valid {
		v := opening.Int64
		st.OpeningBalance = &v
	}
	if closing.Valid {
		v := closing.Int64
		st.ClosingBalance = &v
	}
	out := &ReconciliationReport{Statement: st, UnmatchedManual: []models.Transaction{},
		UnrecordedBank: []models.BankTransaction{}, AmountDiscrepancies: []Discrepancy{}}

	// Bank side: every line with its reconciliation (if any).
	rows, err := s.db.QueryContext(ctx, `SELECT bt.id, bt.statement_id, bt.account_id, bt.line_no, bt.transaction_date, bt.value_date,
		bt.description, bt.reference, bt.debit, bt.credit, bt.balance, bt.fingerprint, bt.created_at,
		COALESCE(r.status, ''), r.transaction_id, COALESCE(r.amount_diff, 0)
		FROM bank_transactions bt LEFT JOIN reconciliations r ON r.bank_transaction_id = bt.id AND r.user_id = bt.user_id
		WHERE bt.statement_id = ? AND bt.user_id = ? ORDER BY bt.line_no`, statementID, uid)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	type pending struct {
		bank models.BankTransaction
		txID string
		diff int64
	}
	var discrepancies []pending
	for rows.Next() {
		var bt models.BankTransaction
		var valueDate, txID sql.NullString
		var balance sql.NullInt64
		var status string
		var diff int64
		if err := rows.Scan(&bt.ID, &bt.StatementID, &bt.AccountID, &bt.LineNo, &bt.TransactionDate, &valueDate,
			&bt.Description, &bt.Reference, &bt.Debit, &bt.Credit, &balance, &bt.Fingerprint, &bt.CreatedAt,
			&status, &txID, &diff); err != nil {
			return nil, apperr.Internal(err)
		}
		if valueDate.Valid {
			v := valueDate.String
			bt.ValueDate = &v
		}
		if balance.Valid {
			v := balance.Int64
			bt.Balance = &v
		}
		out.TotalDebits += bt.Debit
		out.TotalCredits += bt.Credit
		switch status {
		case "":
			out.UnrecordedBank = append(out.UnrecordedBank, bt)
		case models.ReconMatched:
			out.Matched++
			if diff != 0 && txID.Valid {
				discrepancies = append(discrepancies, pending{bank: bt, txID: txID.String, diff: diff})
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	for _, d := range discrepancies {
		t, err := s.txs.Get(ctx, s.db, uid, d.txID)
		if err != nil {
			return nil, apperr.Internal(err)
		}
		if t == nil {
			continue
		}
		out.AmountDiscrepancies = append(out.AmountDiscrepancies, Discrepancy{BankTransaction: d.bank, Transaction: *t, Difference: d.diff})
	}

	// Manual side: non-void transactions touching the account within the period.
	filter := dto.TransactionFilter{UserID: uid, AccountID: st.AccountID, DateFrom: st.PeriodStart, DateTo: st.PeriodEnd,
		Sort: "date", Order: "asc", Page: 1, PerPage: 200}
	var manual []models.Transaction
	for {
		page, total, err := s.txs.List(ctx, s.db, filter)
		if err != nil {
			return nil, apperr.Internal(err)
		}
		manual = append(manual, page...)
		if len(page) == 0 || len(manual) >= total {
			break
		}
		filter.Page++
	}
	for _, t := range manual {
		switch t.Type {
		case models.TxExpense:
			out.ManualExpenses += t.Amount
		case models.TxIncome, models.TxRefund:
			out.ManualIncome += t.Amount
		}
		if t.ReconciliationStatus == "" {
			out.UnmatchedManual = append(out.UnmatchedManual, t)
		}
	}

	out.Balance = BalanceCheck{Opening: st.OpeningBalance, Closing: st.ClosingBalance}
	if st.OpeningBalance != nil {
		v := *st.OpeningBalance + out.TotalCredits - out.TotalDebits
		out.Balance.ComputedClosing = &v
		out.Balance.Verified = st.ClosingBalance != nil && v == *st.ClosingBalance
	}
	return out, nil
}
