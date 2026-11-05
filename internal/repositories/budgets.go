package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/bugloper/xpenses/internal/models"
)

type BudgetRepo struct{}

func (BudgetRepo) List(ctx context.Context, db DBTX, userID string) ([]models.Budget, error) {
	rows, err := db.QueryContext(ctx, `SELECT user_id, id, category_id, amount, created_at, updated_at FROM budgets WHERE user_id = ? ORDER BY created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Budget{}
	for rows.Next() {
		var b models.Budget
		if err := rows.Scan(&b.UserID, &b.ID, &b.CategoryID, &b.Amount, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (BudgetRepo) Get(ctx context.Context, db DBTX, userID, id string) (*models.Budget, error) {
	var b models.Budget
	err := db.QueryRowContext(ctx, `SELECT user_id, id, category_id, amount, created_at, updated_at FROM budgets WHERE id = ? AND user_id = ?`, id, userID).
		Scan(&b.UserID, &b.ID, &b.CategoryID, &b.Amount, &b.CreatedAt, &b.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &b, err
}

func (BudgetRepo) Insert(ctx context.Context, db DBTX, b *models.Budget) error {
	_, err := db.ExecContext(ctx, `INSERT INTO budgets (user_id, id, category_id, amount, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
		b.UserID, b.ID, b.CategoryID, b.Amount, b.CreatedAt, b.UpdatedAt)
	return err
}

func (BudgetRepo) Update(ctx context.Context, db DBTX, b *models.Budget) error {
	_, err := db.ExecContext(ctx, `UPDATE budgets SET amount=?, updated_at=? WHERE id=? AND user_id=?`, b.Amount, b.UpdatedAt, b.ID, b.UserID)
	return err
}

func (BudgetRepo) Delete(ctx context.Context, db DBTX, userID, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM budgets WHERE id = ? AND user_id = ?`, id, userID)
	return err
}
