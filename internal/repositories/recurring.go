package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/bugloper/xpensiv/internal/models"
)

type RecurringRepo struct{}

const recurringCols = `id, name, type, amount, currency, account_id, transfer_account_id, category_id, description, payee,
	frequency, interval, start_date, end_date, next_run_date, generate_as, is_active, created_at, updated_at`

func scanRecurring(s interface{ Scan(...any) error }) (*models.RecurringTransaction, error) {
	var r models.RecurringTransaction
	var transfer, cat, end sql.NullString
	var active int
	if err := s.Scan(&r.ID, &r.Name, &r.Type, &r.Amount, &r.Currency, &r.AccountID, &transfer, &cat, &r.Description, &r.Payee,
		&r.Frequency, &r.Interval, &r.StartDate, &end, &r.NextRunDate, &r.GenerateAs, &active, &r.CreatedAt, &r.UpdatedAt); err != nil {
		return nil, err
	}
	r.TransferAccountID = strPtr(transfer)
	r.CategoryID = strPtr(cat)
	r.EndDate = strPtr(end)
	r.IsActive = active == 1
	return &r, nil
}

func (RecurringRepo) List(ctx context.Context, db DBTX) ([]models.RecurringTransaction, error) {
	rows, err := db.QueryContext(ctx, `SELECT `+recurringCols+` FROM recurring_transactions ORDER BY next_run_date, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.RecurringTransaction{}
	for rows.Next() {
		r, err := scanRecurring(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

// ListDue returns active rules whose next_run_date is on or before asOf.
func (RecurringRepo) ListDue(ctx context.Context, db DBTX, asOf string) ([]models.RecurringTransaction, error) {
	rows, err := db.QueryContext(ctx, `SELECT `+recurringCols+` FROM recurring_transactions
		WHERE is_active = 1 AND next_run_date <= ? ORDER BY next_run_date`, asOf)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.RecurringTransaction{}
	for rows.Next() {
		r, err := scanRecurring(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

func (RecurringRepo) Get(ctx context.Context, db DBTX, id string) (*models.RecurringTransaction, error) {
	r, err := scanRecurring(db.QueryRowContext(ctx, `SELECT `+recurringCols+` FROM recurring_transactions WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return r, err
}

func (RecurringRepo) Insert(ctx context.Context, db DBTX, r *models.RecurringTransaction) error {
	_, err := db.ExecContext(ctx, `INSERT INTO recurring_transactions (`+recurringCols+`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		r.ID, r.Name, r.Type, r.Amount, r.Currency, r.AccountID, nullStr(r.TransferAccountID), nullStr(r.CategoryID), r.Description, r.Payee,
		r.Frequency, r.Interval, r.StartDate, nullStr(r.EndDate), r.NextRunDate, r.GenerateAs, boolInt(r.IsActive), r.CreatedAt, r.UpdatedAt)
	return err
}

func (RecurringRepo) Update(ctx context.Context, db DBTX, r *models.RecurringTransaction) error {
	_, err := db.ExecContext(ctx, `UPDATE recurring_transactions SET name=?, amount=?, account_id=?, transfer_account_id=?, category_id=?,
		description=?, payee=?, frequency=?, interval=?, end_date=?, next_run_date=?, generate_as=?, is_active=?, updated_at=? WHERE id=?`,
		r.Name, r.Amount, r.AccountID, nullStr(r.TransferAccountID), nullStr(r.CategoryID), r.Description, r.Payee, r.Frequency, r.Interval,
		nullStr(r.EndDate), r.NextRunDate, r.GenerateAs, boolInt(r.IsActive), r.UpdatedAt, r.ID)
	return err
}

func (RecurringRepo) Delete(ctx context.Context, db DBTX, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM recurring_transactions WHERE id = ?`, id)
	return err
}
