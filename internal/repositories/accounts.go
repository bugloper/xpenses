package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/bugloper/xpensiv/internal/models"
)

type AccountRepo struct{}

// balanceExpr computes an account's current balance from the ledger. Only
// 'cleared' transactions count. Transfers debit account_id and credit
// transfer_account_id; adjustments are signed.
const balanceExpr = `a.opening_balance
	+ COALESCE((SELECT SUM(CASE t.type
		WHEN 'income' THEN t.amount
		WHEN 'refund' THEN t.amount
		WHEN 'adjustment' THEN t.amount
		WHEN 'expense' THEN -t.amount
		WHEN 'transfer' THEN -t.amount
		ELSE 0 END)
		FROM transactions t WHERE t.account_id = a.id AND t.status = 'cleared'), 0)
	+ COALESCE((SELECT SUM(t.amount) FROM transactions t
		WHERE t.transfer_account_id = a.id AND t.type = 'transfer' AND t.status = 'cleared'), 0)`

const accountCols = `a.id, a.name, a.type, a.currency, a.opening_balance, a.opening_balance_date,
	a.account_number, a.is_active, a.created_at, a.updated_at, ` + balanceExpr

func scanAccount(s interface{ Scan(...any) error }) (*models.Account, error) {
	var a models.Account
	var active int
	if err := s.Scan(&a.ID, &a.Name, &a.Type, &a.Currency, &a.OpeningBalance, &a.OpeningBalanceDate,
		&a.AccountNumber, &active, &a.CreatedAt, &a.UpdatedAt, &a.CurrentBalance); err != nil {
		return nil, err
	}
	a.IsActive = active == 1
	return &a, nil
}

func (AccountRepo) List(ctx context.Context, db DBTX, includeInactive bool) ([]models.Account, error) {
	q := `SELECT ` + accountCols + ` FROM accounts a`
	if !includeInactive {
		q += ` WHERE a.is_active = 1`
	}
	q += ` ORDER BY a.created_at, a.name`
	rows, err := db.QueryContext(ctx, q)
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

func (AccountRepo) Get(ctx context.Context, db DBTX, id string) (*models.Account, error) {
	a, err := scanAccount(db.QueryRowContext(ctx, `SELECT `+accountCols+` FROM accounts a WHERE a.id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return a, err
}

func (AccountRepo) Insert(ctx context.Context, db DBTX, a *models.Account) error {
	_, err := db.ExecContext(ctx, `INSERT INTO accounts
		(id, name, type, currency, opening_balance, opening_balance_date, account_number, is_active, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?)`,
		a.ID, a.Name, a.Type, a.Currency, a.OpeningBalance, a.OpeningBalanceDate, a.AccountNumber, boolInt(a.IsActive), a.CreatedAt, a.UpdatedAt)
	return err
}

func (AccountRepo) Update(ctx context.Context, db DBTX, a *models.Account) error {
	_, err := db.ExecContext(ctx, `UPDATE accounts SET name=?, type=?, currency=?, opening_balance=?,
		opening_balance_date=?, account_number=?, is_active=?, updated_at=? WHERE id=?`,
		a.Name, a.Type, a.Currency, a.OpeningBalance, a.OpeningBalanceDate, a.AccountNumber, boolInt(a.IsActive), a.UpdatedAt, a.ID)
	return err
}

// TotalBalance sums the balance of every active account.
func (AccountRepo) TotalBalance(ctx context.Context, db DBTX) (int64, error) {
	var total sql.NullInt64
	err := db.QueryRowContext(ctx, `SELECT SUM(`+balanceExpr+`) FROM accounts a WHERE a.is_active = 1`).Scan(&total)
	return total.Int64, err
}
