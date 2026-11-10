package repositories

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/bugloper/xpenses/internal/models"
)

type AccountRepo struct{}

// balanceExpr computes an account's current balance from the ledger. Only
// 'cleared' transactions count. Transfers debit account_id and credit
// transfer_account_id; adjustments are signed. Borrowing and being repaid
// bring money in, lending and repaying take it out.
const balanceExpr = `a.opening_balance
	+ COALESCE((SELECT SUM(CASE t.type
		WHEN 'income' THEN t.amount
		WHEN 'refund' THEN t.amount
		WHEN 'adjustment' THEN t.amount
		WHEN 'loan_received' THEN t.amount
		WHEN 'loan_repayment_received' THEN t.amount
		WHEN 'expense' THEN -t.amount
		WHEN 'transfer' THEN -t.amount
		WHEN 'loan_given' THEN -t.amount
		WHEN 'loan_repayment' THEN -t.amount
		ELSE 0 END)
		FROM transactions t WHERE t.account_id = a.id AND t.status = 'cleared'), 0)
	+ COALESCE((SELECT SUM(t.amount) FROM transactions t
		WHERE t.transfer_account_id = a.id AND t.type = 'transfer' AND t.status = 'cleared'), 0)`

const accountCols = `a.user_id, a.id, a.name, a.type, a.currency, a.opening_balance, a.opening_balance_date,
	a.account_number, a.is_active, a.created_at, a.updated_at, ` + balanceExpr

func scanAccount(s interface{ Scan(...any) error }) (*models.Account, error) {
	var a models.Account
	var active int
	if err := s.Scan(&a.UserID, &a.ID, &a.Name, &a.Type, &a.Currency, &a.OpeningBalance, &a.OpeningBalanceDate,
		&a.AccountNumber, &active, &a.CreatedAt, &a.UpdatedAt, &a.CurrentBalance); err != nil {
		return nil, err
	}
	a.IsActive = active == 1
	return &a, nil
}

func (AccountRepo) List(ctx context.Context, db DBTX, userID string, includeInactive bool) ([]models.Account, error) {
	q := `SELECT ` + accountCols + ` FROM accounts a WHERE a.user_id = ?`
	if !includeInactive {
		q += ` AND a.is_active = 1`
	}
	q += ` ORDER BY a.created_at, a.name`
	rows, err := db.QueryContext(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Account{}
	for rows.Next() {
		a, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

func (AccountRepo) Get(ctx context.Context, db DBTX, userID, id string) (*models.Account, error) {
	a, err := scanAccount(db.QueryRowContext(ctx, `SELECT `+accountCols+` FROM accounts a WHERE a.id = ? AND a.user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return a, err
}

func (AccountRepo) Insert(ctx context.Context, db DBTX, a *models.Account) error {
	_, err := db.ExecContext(ctx, `INSERT INTO accounts
		(user_id, id, name, type, currency, opening_balance, opening_balance_date, account_number, is_active, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		a.UserID, a.ID, a.Name, a.Type, a.Currency, a.OpeningBalance, a.OpeningBalanceDate, a.AccountNumber, boolInt(a.IsActive), a.CreatedAt, a.UpdatedAt)
	return err
}

func (AccountRepo) Update(ctx context.Context, db DBTX, a *models.Account) error {
	_, err := db.ExecContext(ctx, `UPDATE accounts SET name=?, type=?, currency=?, opening_balance=?,
		opening_balance_date=?, account_number=?, is_active=?, updated_at=? WHERE id=? AND user_id=?`,
		a.Name, a.Type, a.Currency, a.OpeningBalance, a.OpeningBalanceDate, a.AccountNumber, boolInt(a.IsActive), a.UpdatedAt, a.ID, a.UserID)
	return err
}

// balanceAtExpr is balanceExpr counting only transactions dated on or before
// its two date placeholders (both bound to the same as-of date).
var balanceAtExpr = strings.NewReplacer(
	`t.status = 'cleared'), 0)`, `t.status = 'cleared' AND t.transaction_date <= ?), 0)`,
).Replace(balanceExpr)

// TotalBalanceAt sums the balance of every active account at the end of the
// asOf calendar date: transactions dated later are left out.
func (AccountRepo) TotalBalanceAt(ctx context.Context, db DBTX, userID, asOf string) (int64, error) {
	var total sql.NullInt64
	err := db.QueryRowContext(ctx, `SELECT SUM(`+balanceAtExpr+`) FROM accounts a WHERE a.is_active = 1 AND a.user_id = ?`,
		asOf, asOf, userID).Scan(&total)
	return total.Int64, err
}
