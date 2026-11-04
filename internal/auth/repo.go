package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/bugloper/xpensiv/internal/models"
	"github.com/bugloper/xpensiv/internal/repositories"
)

type Repo struct{}

const userCols = `id, email, name, password_hash, role, is_active, last_login_at, created_at, updated_at`

func scanUser(s interface{ Scan(...any) error }) (*models.User, error) {
	var u models.User
	var active int
	var last sql.NullString
	if err := s.Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.Role, &active, &last, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, err
	}
	u.IsActive = active == 1
	if last.Valid {
		v := last.String
		u.LastLoginAt = &v
	}
	return &u, nil
}

func (Repo) CountUsers(ctx context.Context, db repositories.DBTX) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

func (Repo) CountAdmins(ctx context.Context, db repositories.DBTX) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1`).Scan(&n)
	return n, err
}

func (Repo) GetUser(ctx context.Context, db repositories.DBTX, id string) (*models.User, error) {
	u, err := scanUser(db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return u, err
}

func (Repo) GetUserByEmail(ctx context.Context, db repositories.DBTX, email string) (*models.User, error) {
	u, err := scanUser(db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE email = ?`, email))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return u, err
}

func (Repo) ListUsers(ctx context.Context, db repositories.DBTX) ([]models.User, error) {
	rows, err := db.QueryContext(ctx, `SELECT `+userCols+` FROM users ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

func (Repo) InsertUser(ctx context.Context, db repositories.DBTX, u *models.User) error {
	_, err := db.ExecContext(ctx, `INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
		u.ID, u.Email, u.Name, u.PasswordHash, u.Role, boolInt(u.IsActive), u.CreatedAt, u.UpdatedAt)
	return err
}

// The update methods each touch only the columns their caller owns. A request
// carries a snapshot of the user loaded with its session; writing the whole row
// back would let a stale snapshot undo a concurrent change (an admin demotion,
// a password change).

func (Repo) UpdateUserName(ctx context.Context, db repositories.DBTX, id, name, updatedAt string) error {
	_, err := db.ExecContext(ctx, `UPDATE users SET name=?, updated_at=? WHERE id=?`, name, updatedAt, id)
	return err
}

func (Repo) UpdateUserPassword(ctx context.Context, db repositories.DBTX, id, hash, updatedAt string) error {
	_, err := db.ExecContext(ctx, `UPDATE users SET password_hash=?, updated_at=? WHERE id=?`, hash, updatedAt, id)
	return err
}

func (Repo) UpdateUserLastLogin(ctx context.Context, db repositories.DBTX, id, at string) error {
	_, err := db.ExecContext(ctx, `UPDATE users SET last_login_at=?, updated_at=? WHERE id=?`, at, at, id)
	return err
}

func (Repo) UpdateUserRoleActive(ctx context.Context, db repositories.DBTX, id, role string, active bool, updatedAt string) error {
	_, err := db.ExecContext(ctx, `UPDATE users SET role=?, is_active=?, updated_at=? WHERE id=?`, role, boolInt(active), updatedAt, id)
	return err
}

func (Repo) DeleteUser(ctx context.Context, db repositories.DBTX, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	return err
}

// Sessions

func (Repo) InsertSession(ctx context.Context, db repositories.DBTX, s *models.Session) error {
	_, err := db.ExecContext(ctx, `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent, ip) VALUES (?,?,?,?,?,?,?)`,
		s.ID, s.UserID, s.CreatedAt, s.LastSeenAt, s.ExpiresAt, s.UserAgent, s.IP)
	return err
}

// GetSession returns the session and its user when the session exists.
func (Repo) GetSession(ctx context.Context, db repositories.DBTX, id string) (*models.Session, *models.User, error) {
	var s models.Session
	var u models.User
	var active int
	var last sql.NullString
	err := db.QueryRowContext(ctx, `SELECT s.id, s.user_id, s.created_at, s.last_seen_at, s.expires_at, s.user_agent, s.ip,
		u.id, u.email, u.name, u.password_hash, u.role, u.is_active, u.last_login_at, u.created_at, u.updated_at
		FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, id).
		Scan(&s.ID, &s.UserID, &s.CreatedAt, &s.LastSeenAt, &s.ExpiresAt, &s.UserAgent, &s.IP,
			&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.Role, &active, &last, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	u.IsActive = active == 1
	if last.Valid {
		v := last.String
		u.LastLoginAt = &v
	}
	return &s, &u, nil
}

func (Repo) TouchSession(ctx context.Context, db repositories.DBTX, id, lastSeen string) error {
	_, err := db.ExecContext(ctx, `UPDATE sessions SET last_seen_at = ? WHERE id = ?`, lastSeen, id)
	return err
}

func (Repo) ListSessions(ctx context.Context, db repositories.DBTX, userID string) ([]models.Session, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, user_id, created_at, last_seen_at, expires_at, user_agent, ip FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Session{}
	for rows.Next() {
		var s models.Session
		if err := rows.Scan(&s.ID, &s.UserID, &s.CreatedAt, &s.LastSeenAt, &s.ExpiresAt, &s.UserAgent, &s.IP); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (Repo) DeleteSession(ctx context.Context, db repositories.DBTX, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id)
	return err
}

// DeleteUserSessions removes every session of a user, optionally keeping one.
func (Repo) DeleteUserSessions(ctx context.Context, db repositories.DBTX, userID, keepID string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ? AND id <> ?`, userID, keepID)
	return err
}

func (Repo) PurgeExpiredSessions(ctx context.Context, db repositories.DBTX, now, idleCutoff string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?`, now, idleCutoff)
	return err
}

// Login attempts

func (Repo) RecordAttempt(ctx context.Context, db repositories.DBTX, key, at string) error {
	_, err := db.ExecContext(ctx, `INSERT INTO login_attempts (key, attempted_at) VALUES (?, ?)`, key, at)
	return err
}

func (Repo) CountAttempts(ctx context.Context, db repositories.DBTX, key, since string) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM login_attempts WHERE key = ? AND attempted_at >= ?`, key, since).Scan(&n)
	return n, err
}

func (Repo) ClearAttempts(ctx context.Context, db repositories.DBTX, key string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM login_attempts WHERE key = ?`, key)
	return err
}

func (Repo) PurgeAttempts(ctx context.Context, db repositories.DBTX, before string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM login_attempts WHERE attempted_at < ?`, before)
	return err
}

// Invites

func (Repo) InsertInvite(ctx context.Context, db repositories.DBTX, inv *models.Invite, tokenHash string) error {
	_, err := db.ExecContext(ctx, `INSERT INTO invites (id, token_hash, email, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?)`,
		inv.ID, tokenHash, inv.Email, inv.CreatedBy, inv.CreatedAt, inv.ExpiresAt)
	return err
}

const inviteCols = `i.id, i.email, i.created_by, i.created_at, i.expires_at, i.used_at, u.email`

func scanInvite(s interface{ Scan(...any) error }) (*models.Invite, error) {
	var inv models.Invite
	var used, usedBy sql.NullString
	if err := s.Scan(&inv.ID, &inv.Email, &inv.CreatedBy, &inv.CreatedAt, &inv.ExpiresAt, &used, &usedBy); err != nil {
		return nil, err
	}
	if used.Valid {
		v := used.String
		inv.UsedAt = &v
	}
	if usedBy.Valid {
		v := usedBy.String
		inv.UsedByEmail = &v
	}
	return &inv, nil
}

func (Repo) ListInvites(ctx context.Context, db repositories.DBTX) ([]models.Invite, error) {
	rows, err := db.QueryContext(ctx, `SELECT `+inviteCols+` FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Invite{}
	for rows.Next() {
		inv, err := scanInvite(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *inv)
	}
	return out, rows.Err()
}

func (Repo) GetInviteByHash(ctx context.Context, db repositories.DBTX, tokenHash string) (*models.Invite, error) {
	inv, err := scanInvite(db.QueryRowContext(ctx, `SELECT `+inviteCols+` FROM invites i LEFT JOIN users u ON u.id = i.used_by WHERE i.token_hash = ?`, tokenHash))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return inv, err
}

// UseInvite marks the invite used. It reports false when the invite was
// already used (or deleted) by the time of the write.
func (Repo) UseInvite(ctx context.Context, db repositories.DBTX, id, userID, at string) (bool, error) {
	res, err := db.ExecContext(ctx, `UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL`, at, userID, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func (Repo) DeleteInvite(ctx context.Context, db repositories.DBTX, id string) (bool, error) {
	res, err := db.ExecContext(ctx, `DELETE FROM invites WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// App settings

func (Repo) GetAppSetting(ctx context.Context, db repositories.DBTX, key, def string) (string, error) {
	var v string
	err := db.QueryRowContext(ctx, `SELECT value FROM app_settings WHERE key = ?`, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return def, nil
	}
	return v, err
}

func (Repo) SetAppSetting(ctx context.Context, db repositories.DBTX, key, value string) error {
	_, err := db.ExecContext(ctx, `INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, key, value, time.Now().UTC().Format(time.RFC3339))
	return err
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
