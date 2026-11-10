package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/bugloper/xpenses/internal/models"
)

type LoanRepo struct{}

// loanSelect reads a loan with its amounts worked out from cleared
// transactions: what was lent or borrowed on it (on top of opening_amount),
// the principal repaid, and the interest booked against it as expense or
// income.
const loanSelect = `SELECT l.user_id, l.id, l.direction, l.counterparty, l.opening_amount, l.currency, l.start_date,
	l.due_date, l.notes, l.created_at, l.updated_at,
	l.opening_amount + COALESCE(SUM(CASE WHEN t.type IN ('loan_given','loan_received') THEN t.amount END), 0),
	COALESCE(SUM(CASE WHEN t.type IN ('loan_repayment','loan_repayment_received') THEN t.amount END), 0),
	COALESCE(SUM(CASE WHEN t.type IN ('expense','income') THEN t.amount END), 0),
	COUNT(t.id), COALESCE(MAX(t.transaction_date), l.start_date)
	FROM loans l LEFT JOIN transactions t ON t.loan_id = l.id AND t.status = 'cleared'`

func scanLoan(s interface{ Scan(...any) error }) (*models.Loan, error) {
	var l models.Loan
	var due sql.NullString
	if err := s.Scan(&l.UserID, &l.ID, &l.Direction, &l.Counterparty, &l.OpeningAmount, &l.Currency, &l.StartDate,
		&due, &l.Notes, &l.CreatedAt, &l.UpdatedAt,
		&l.Principal, &l.Repaid, &l.Interest, &l.TransactionCount, &l.LastActivity); err != nil {
		return nil, err
	}
	l.DueDate = strPtr(due)
	l.Outstanding = l.Principal - l.Repaid
	l.Status = models.LoanOpen
	if l.Outstanding <= 0 {
		l.Status = models.LoanSettled
	}
	return &l, nil
}

// List returns the user's loans, open ones first, most recently active first.
func (LoanRepo) List(ctx context.Context, db DBTX, userID string) ([]models.Loan, error) {
	rows, err := db.QueryContext(ctx, loanSelect+` WHERE l.user_id = ? GROUP BY l.id
		ORDER BY (l.opening_amount + COALESCE(SUM(CASE WHEN t.type IN ('loan_given','loan_received') THEN t.amount END), 0)
			- COALESCE(SUM(CASE WHEN t.type IN ('loan_repayment','loan_repayment_received') THEN t.amount END), 0)) <= 0,
			COALESCE(MAX(t.transaction_date), l.start_date) DESC, l.counterparty`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Loan{}
	for rows.Next() {
		l, err := scanLoan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *l)
	}
	return out, rows.Err()
}

func (LoanRepo) Get(ctx context.Context, db DBTX, userID, id string) (*models.Loan, error) {
	l, err := scanLoan(db.QueryRowContext(ctx, loanSelect+` WHERE l.id = ? AND l.user_id = ? GROUP BY l.id`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return l, err
}

// Outstanding is what is still owed on the loan, leaving out one transaction
// (the one being edited, so its old amount does not count against its new one).
func (LoanRepo) Outstanding(ctx context.Context, db DBTX, userID, id, exceptTxID string) (int64, error) {
	var out int64
	err := db.QueryRowContext(ctx, `SELECT l.opening_amount
		+ COALESCE((SELECT SUM(CASE WHEN t.type IN ('loan_given','loan_received') THEN t.amount
			WHEN t.type IN ('loan_repayment','loan_repayment_received') THEN -t.amount ELSE 0 END)
			FROM transactions t WHERE t.loan_id = l.id AND t.status = 'cleared' AND t.id <> ?), 0)
		FROM loans l WHERE l.id = ? AND l.user_id = ?`, exceptTxID, id, userID).Scan(&out)
	return out, err
}

// CountTransactions counts every transaction on the loan, whatever its status.
func (LoanRepo) CountTransactions(ctx context.Context, db DBTX, userID, id string) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM transactions WHERE loan_id = ? AND user_id = ?`, id, userID).Scan(&n)
	return n, err
}

func (LoanRepo) Insert(ctx context.Context, db DBTX, l *models.Loan) error {
	_, err := db.ExecContext(ctx, `INSERT INTO loans
		(id, user_id, direction, counterparty, opening_amount, currency, start_date, due_date, notes, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		l.ID, l.UserID, l.Direction, l.Counterparty, l.OpeningAmount, l.Currency, l.StartDate, nullStr(l.DueDate), l.Notes, l.CreatedAt, l.UpdatedAt)
	return err
}

func (LoanRepo) Update(ctx context.Context, db DBTX, l *models.Loan) error {
	_, err := db.ExecContext(ctx, `UPDATE loans SET counterparty=?, opening_amount=?, start_date=?, due_date=?, notes=?, updated_at=?
		WHERE id=? AND user_id=?`,
		l.Counterparty, l.OpeningAmount, l.StartDate, nullStr(l.DueDate), l.Notes, l.UpdatedAt, l.ID, l.UserID)
	return err
}

func (LoanRepo) Delete(ctx context.Context, db DBTX, userID, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM loans WHERE id = ? AND user_id = ?`, id, userID)
	return err
}
