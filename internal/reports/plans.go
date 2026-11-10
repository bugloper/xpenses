package reports

import (
	"context"

	"github.com/bugloper/xpenses/internal/auth"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
)

// LoanActivityRow is one month of money moving on loans. None of it is income
// or expense; interest, which is, is reported beside it for context.
type LoanActivityRow struct {
	Period string `json:"period"`
	// Money that went out to others, and came back from them.
	Lent         int64 `json:"lent"`
	RepaidToYou  int64 `json:"repaid_to_you"`
	Borrowed     int64 `json:"borrowed"`
	YouRepaid    int64 `json:"you_repaid"`
	InterestPaid int64 `json:"interest_paid"`
	InterestEarn int64 `json:"interest_earned"`
}

// LoanActivity totals cleared loan movements (and loan interest) by month.
func (s *Service) LoanActivity(ctx context.Context, p Period) ([]LoanActivityRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT t.transaction_date,
		COALESCE(SUM(CASE WHEN t.type = 'loan_given' THEN t.amount END), 0),
		COALESCE(SUM(CASE WHEN t.type = 'loan_repayment_received' THEN t.amount END), 0),
		COALESCE(SUM(CASE WHEN t.type = 'loan_received' THEN t.amount END), 0),
		COALESCE(SUM(CASE WHEN t.type = 'loan_repayment' THEN t.amount END), 0),
		COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount END), 0),
		COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount END), 0)
		FROM transactions t WHERE t.user_id = ? AND t.status = 'cleared' AND t.loan_id IS NOT NULL
		AND t.transaction_date BETWEEN ? AND ? GROUP BY t.transaction_date`, auth.UserID(ctx), p.From, p.To)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	keys := p.Buckets(GranMonth)
	idx := make(map[string]int, len(keys))
	out := make([]LoanActivityRow, len(keys))
	for i, k := range keys {
		idx[k] = i
		out[i].Period = k
	}
	for rows.Next() {
		var date string
		var r LoanActivityRow
		if err := rows.Scan(&date, &r.Lent, &r.RepaidToYou, &r.Borrowed, &r.YouRepaid, &r.InterestPaid, &r.InterestEarn); err != nil {
			return nil, apperr.Internal(err)
		}
		d, err := models.ParseDate(date)
		if err != nil {
			continue
		}
		if i, ok := idx[BucketKey(d, GranMonth)]; ok {
			o := &out[i]
			o.Lent += r.Lent
			o.RepaidToYou += r.RepaidToYou
			o.Borrowed += r.Borrowed
			o.YouRepaid += r.YouRepaid
			o.InterestPaid += r.InterestPaid
			o.InterestEarn += r.InterestEarn
		}
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}

// SavingsActivityRow is one month of goal contributions and withdrawals.
// These are allocations: they say nothing about account balances.
type SavingsActivityRow struct {
	Period string `json:"period"`
	Added  int64  `json:"added"`
	Taken  int64  `json:"taken"`
}

// SavingsActivity totals savings goal entries by month.
func (s *Service) SavingsActivity(ctx context.Context, p Period) ([]SavingsActivityRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT e.entry_date,
		COALESCE(SUM(CASE WHEN e.amount > 0 THEN e.amount END), 0),
		COALESCE(SUM(CASE WHEN e.amount < 0 THEN -e.amount END), 0)
		FROM savings_goal_entries e WHERE e.user_id = ? AND e.entry_date BETWEEN ? AND ?
		GROUP BY e.entry_date`, auth.UserID(ctx), p.From, p.To)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	defer rows.Close()
	keys := p.Buckets(GranMonth)
	idx := make(map[string]int, len(keys))
	out := make([]SavingsActivityRow, len(keys))
	for i, k := range keys {
		idx[k] = i
		out[i].Period = k
	}
	for rows.Next() {
		var date string
		var added, taken int64
		if err := rows.Scan(&date, &added, &taken); err != nil {
			return nil, apperr.Internal(err)
		}
		d, err := models.ParseDate(date)
		if err != nil {
			continue
		}
		if i, ok := idx[BucketKey(d, GranMonth)]; ok {
			out[i].Added += added
			out[i].Taken += taken
		}
	}
	if err := rows.Err(); err != nil {
		return nil, apperr.Internal(err)
	}
	return out, nil
}
