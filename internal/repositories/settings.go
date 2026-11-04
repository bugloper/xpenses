package repositories

import (
	"context"

	"github.com/bugloper/xpensiv/internal/models"
)

type SettingsRepo struct{}

func (SettingsRepo) All(ctx context.Context, db DBTX) (map[string]string, error) {
	rows, err := db.QueryContext(ctx, `SELECT key, value FROM settings`)
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

func (SettingsRepo) Get(ctx context.Context, db DBTX, key, def string) (string, error) {
	var v string
	err := db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			return def, nil
		}
		return def, err
	}
	return v, nil
}

func (SettingsRepo) Set(ctx context.Context, db DBTX, key, value string) error {
	_, err := db.ExecContext(ctx, `INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, key, value, models.NowUTC())
	return err
}
