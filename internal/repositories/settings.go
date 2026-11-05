package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/bugloper/xpenses/internal/models"
)

// SettingsRepo stores per-user key/value settings.
type SettingsRepo struct{}

func (SettingsRepo) All(ctx context.Context, db DBTX, userID string) (map[string]string, error) {
	rows, err := db.QueryContext(ctx, `SELECT key, value FROM settings WHERE user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

func (SettingsRepo) Get(ctx context.Context, db DBTX, userID, key, def string) (string, error) {
	var v string
	err := db.QueryRowContext(ctx, `SELECT value FROM settings WHERE user_id = ? AND key = ?`, userID, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return def, nil
	}
	if err != nil {
		return def, err
	}
	return v, nil
}

func (SettingsRepo) Set(ctx context.Context, db DBTX, userID, key, value string) error {
	_, err := db.ExecContext(ctx, `INSERT INTO settings (user_id, key, value, updated_at) VALUES (?,?,?,?)
		ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, userID, key, value, models.NowUTC())
	return err
}
