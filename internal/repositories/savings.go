package repositories

import (
	"context"
	"database/sql"
	"errors"
	"math"

	"github.com/bugloper/xpenses/internal/models"
)

type SavingsRepo struct{}

const goalSelect = `SELECT g.user_id, g.id, g.name, g.target_amount, g.target_date, g.account_id, COALESCE(a.name, ''),
	g.notes, g.created_at, g.updated_at,
	COALESCE((SELECT SUM(e.amount) FROM savings_goal_entries e WHERE e.goal_id = g.id), 0)
	FROM savings_goals g LEFT JOIN accounts a ON a.id = g.account_id`

func scanGoal(s interface{ Scan(...any) error }) (*models.SavingsGoal, error) {
	var g models.SavingsGoal
	var date, acct sql.NullString
	if err := s.Scan(&g.UserID, &g.ID, &g.Name, &g.TargetAmount, &date, &acct, &g.AccountName,
		&g.Notes, &g.CreatedAt, &g.UpdatedAt, &g.Saved); err != nil {
		return nil, err
	}
	g.TargetDate = strPtr(date)
	g.AccountID = strPtr(acct)
	g.Reached = g.Saved >= g.TargetAmount
	if g.TargetAmount > 0 {
		g.Pct = math.Min(100, math.Round(float64(g.Saved)*1000/float64(g.TargetAmount))/10)
	}
	if g.Pct < 0 {
		g.Pct = 0
	}
	return &g, nil
}

// ListGoals returns goals still being saved for first, then reached ones.
func (SavingsRepo) ListGoals(ctx context.Context, db DBTX, userID string) ([]models.SavingsGoal, error) {
	rows, err := db.QueryContext(ctx, goalSelect+` WHERE g.user_id = ? ORDER BY g.target_date IS NULL, g.target_date, g.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.SavingsGoal{}
	reached := []models.SavingsGoal{}
	for rows.Next() {
		g, err := scanGoal(rows)
		if err != nil {
			return nil, err
		}
		if g.Reached {
			reached = append(reached, *g)
		} else {
			out = append(out, *g)
		}
	}
	return append(out, reached...), rows.Err()
}

func (SavingsRepo) GetGoal(ctx context.Context, db DBTX, userID, id string) (*models.SavingsGoal, error) {
	g, err := scanGoal(db.QueryRowContext(ctx, goalSelect+` WHERE g.id = ? AND g.user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return g, err
}

func (SavingsRepo) InsertGoal(ctx context.Context, db DBTX, g *models.SavingsGoal) error {
	_, err := db.ExecContext(ctx, `INSERT INTO savings_goals (id, user_id, name, target_amount, target_date, account_id, notes, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?)`,
		g.ID, g.UserID, g.Name, g.TargetAmount, nullStr(g.TargetDate), nullStr(g.AccountID), g.Notes, g.CreatedAt, g.UpdatedAt)
	return err
}

func (SavingsRepo) UpdateGoal(ctx context.Context, db DBTX, g *models.SavingsGoal) error {
	_, err := db.ExecContext(ctx, `UPDATE savings_goals SET name=?, target_amount=?, target_date=?, account_id=?, notes=?, updated_at=?
		WHERE id=? AND user_id=?`,
		g.Name, g.TargetAmount, nullStr(g.TargetDate), nullStr(g.AccountID), g.Notes, g.UpdatedAt, g.ID, g.UserID)
	return err
}

func (SavingsRepo) DeleteGoal(ctx context.Context, db DBTX, userID, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM savings_goals WHERE id = ? AND user_id = ?`, id, userID)
	return err
}

// GoalNameTaken is true when another of the user's goals has this name.
func (SavingsRepo) GoalNameTaken(ctx context.Context, db DBTX, userID, name, exceptID string) (bool, error) {
	var n int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM savings_goals WHERE user_id = ? AND name = ? AND id <> ?`, userID, name, exceptID).Scan(&n)
	return n > 0, err
}

func (SavingsRepo) ListEntries(ctx context.Context, db DBTX, userID, goalID string) ([]models.SavingsGoalEntry, error) {
	rows, err := db.QueryContext(ctx, `SELECT user_id, id, goal_id, amount, entry_date, note, transaction_id, created_at
		FROM savings_goal_entries WHERE goal_id = ? AND user_id = ? ORDER BY entry_date DESC, created_at DESC`, goalID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.SavingsGoalEntry{}
	for rows.Next() {
		e, err := scanEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func scanEntry(s interface{ Scan(...any) error }) (*models.SavingsGoalEntry, error) {
	var e models.SavingsGoalEntry
	var tx sql.NullString
	if err := s.Scan(&e.UserID, &e.ID, &e.GoalID, &e.Amount, &e.EntryDate, &e.Note, &tx, &e.CreatedAt); err != nil {
		return nil, err
	}
	e.TransactionID = strPtr(tx)
	return &e, nil
}

func (SavingsRepo) GetEntry(ctx context.Context, db DBTX, userID, goalID, id string) (*models.SavingsGoalEntry, error) {
	e, err := scanEntry(db.QueryRowContext(ctx, `SELECT user_id, id, goal_id, amount, entry_date, note, transaction_id, created_at
		FROM savings_goal_entries WHERE id = ? AND goal_id = ? AND user_id = ?`, id, goalID, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return e, err
}

func (SavingsRepo) InsertEntry(ctx context.Context, db DBTX, e *models.SavingsGoalEntry) error {
	_, err := db.ExecContext(ctx, `INSERT INTO savings_goal_entries (id, user_id, goal_id, amount, entry_date, note, transaction_id, created_at)
		VALUES (?,?,?,?,?,?,?,?)`, e.ID, e.UserID, e.GoalID, e.Amount, e.EntryDate, e.Note, nullStr(e.TransactionID), e.CreatedAt)
	return err
}

func (SavingsRepo) DeleteEntry(ctx context.Context, db DBTX, userID, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM savings_goal_entries WHERE id = ? AND user_id = ?`, id, userID)
	return err
}
