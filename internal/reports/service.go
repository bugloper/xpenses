package reports

import (
	"context"
	"database/sql"
	"math"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/dto"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
	"github.com/bugloper/xpenses/internal/repositories"
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
	TotalBalance       int64                `json:"total_balance"`
	Income             int64                `json:"income"`
	Expenses           int64                `json:"expenses"`
	Net                int64                `json:"net"`
	Previous           PeriodTotals         `json:"previous"`
	ExpenseChangePct   *float64             `json:"expense_change_pct"`
	PendingCount       int                  `json:"pending_count"`
	RecentTransactions []models.Transaction `json:"recent_transactions"`
}

type CategoryRow struct {
	CategoryID *string `json:"category_id"`
	Name       string  `json:"name"`
	Icon       string  `json:"icon"`
	Color      string  `json:"color"`
	// Set when the category is a sub-category; reports roll up by parent.
	ParentID   *string `json:"parent_id"`
	ParentName string  `json:"parent_name"`
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
		COALESCE(c.icon, 'circle'), COALESCE(c.color, '#64748b'), c.parent_id, COALESCE(pc.name, ''), SUM(t.amount), COUNT(*)
		FROM transactions t LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
		LEFT JOIN categories pc ON pc.id = c.parent_id
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
		var id, parent sql.NullString
		if err := rows.Scan(&id, &r.Name, &r.Icon, &r.Color, &parent, &r.ParentName, &r.Amount, &r.Count); err != nil {
			return nil, apperr.Internal(err)
		}
		if id.Valid {
			v := id.String
			r.CategoryID = &v
		}
		if parent.Valid {
			v := parent.String
			r.ParentID = &v
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
