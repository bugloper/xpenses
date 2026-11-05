package services

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/crypto/pbkdf2"

	apperr "github.com/bugloper/xpenses/internal/errors"
)

// BackupService produces consistent SQLite snapshots with VACUUM INTO and can
// restore them. Backups may optionally be encrypted with AES-256-GCM using a
// key derived from a passphrase (PBKDF2-SHA256, 200k iterations).
type BackupService struct {
	DB         *sql.DB
	DBPath     string
	BackupsDir string
}

const (
	backupMagic = "XPENSESENC1"
	// Backups written before the app was renamed carry the old header; they
	// are still restorable.
	legacyMagic = "XPENSIVENC1"
	pbkdfIters  = 200_000
	saltLen     = 16
	nonceLen    = 12
	keyLen      = 32
)

// Create writes a snapshot and returns its path. The file is 0600.
func (s *BackupService) Create(ctx context.Context, passphrase string) (string, error) {
	if err := os.MkdirAll(s.BackupsDir, 0o700); err != nil {
		return "", apperr.Internal(err)
	}
	stamp := time.Now().UTC().Format("20060102-150405")
	plain := filepath.Join(s.BackupsDir, "xpenses-"+stamp+".db")
	// VACUUM INTO produces a consistent copy without blocking writers for long.
	if _, err := s.DB.ExecContext(ctx, `VACUUM INTO ?`, plain); err != nil {
		return "", apperr.Internal(fmt.Errorf("vacuum into: %w", err))
	}
	_ = os.Chmod(plain, 0o600)
	if passphrase == "" {
		return plain, nil
	}
	data, err := os.ReadFile(plain)
	if err != nil {
		return "", apperr.Internal(err)
	}
	_ = os.Remove(plain)
	enc, err := Encrypt(data, passphrase)
	if err != nil {
		return "", apperr.Internal(err)
	}
	out := plain + ".enc"
	if err := os.WriteFile(out, enc, 0o600); err != nil {
		return "", apperr.Internal(err)
	}
	return out, nil
}

// Encrypt seals data with a passphrase-derived key.
func Encrypt(data []byte, passphrase string) ([]byte, error) {
	return encryptWith(data, passphrase, backupMagic)
}

func encryptWith(data []byte, passphrase string, magic string) ([]byte, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	key := pbkdf2.Key([]byte(passphrase), salt, pbkdfIters, keyLen, sha256.New)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, nonceLen)
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	out := []byte(magic)
	out = append(out, salt...)
	out = append(out, nonce...)
	return gcm.Seal(out, nonce, data, []byte(magic)), nil
}

// magicOf returns the header the payload starts with, or "" for a plain file.
func magicOf(data []byte) string {
	for _, m := range []string{backupMagic, legacyMagic} {
		if len(data) >= len(m) && string(data[:len(m)]) == m {
			return m
		}
	}
	return ""
}

// Decrypt reverses Encrypt. Returns ErrNotEncrypted if the payload lacks the magic header.
func Decrypt(data []byte, passphrase string) ([]byte, error) {
	magic := magicOf(data)
	if magic == "" || len(data) < len(magic)+saltLen+nonceLen {
		return nil, ErrNotEncrypted
	}
	rest := data[len(magic):]
	salt, nonce, ct := rest[:saltLen], rest[saltLen:saltLen+nonceLen], rest[saltLen+nonceLen:]
	key := pbkdf2.Key([]byte(passphrase), salt, pbkdfIters, keyLen, sha256.New)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	pt, err := gcm.Open(nil, nonce, ct, []byte(magic))
	if err != nil {
		return nil, errors.New("decryption failed: wrong passphrase or corrupted backup")
	}
	return pt, nil
}

var ErrNotEncrypted = errors.New("backup is not encrypted")

// IsEncrypted reports whether the payload carries the encrypted-backup header.
func IsEncrypted(data []byte) bool {
	return magicOf(data) != ""
}

// restoreTables lists every table in dependency order (parents first). A
// restore replaces the whole instance, users and sessions included, so the
// admin who triggered it must sign in again afterwards.
var restoreTables = []string{
	"users", "sessions", "login_attempts", "invites", "app_settings",
	"accounts", "categories", "recurring_transactions", "transactions", "tags", "transaction_tags",
	"budgets", "settings",
}

// Restore replaces the contents of the live database with the uploaded
// snapshot. The snapshot is attached to a pinned connection and copied table by
// table inside one transaction, so the connection pool stays valid and a failed
// restore leaves the current data untouched. A safety backup of the current
// database is written first.
func (s *BackupService) Restore(ctx context.Context, r io.Reader, passphrase string) error {
	data, err := io.ReadAll(r)
	if err != nil {
		return apperr.Internal(err)
	}
	if IsEncrypted(data) {
		if passphrase == "" {
			return apperr.BadRequest("this backup is encrypted; a passphrase is required")
		}
		data, err = Decrypt(data, passphrase)
		if err != nil {
			return apperr.BadRequest(err.Error())
		}
	}
	if len(data) < 16 || string(data[:15]) != "SQLite format 3" {
		return apperr.BadRequest("file is not a SQLite database backup")
	}
	if err := os.MkdirAll(s.BackupsDir, 0o700); err != nil {
		return apperr.Internal(err)
	}
	tmp := filepath.Join(s.BackupsDir, ".restore-"+time.Now().UTC().Format("20060102-150405")+".db")
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return apperr.Internal(err)
	}
	defer os.Remove(tmp)

	// Safety copy of the current database so the restore is reversible.
	if _, err := s.Create(ctx, ""); err != nil {
		return err
	}

	conn, err := s.DB.Conn(ctx)
	if err != nil {
		return apperr.Internal(err)
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `ATTACH DATABASE ? AS restore_src`, tmp); err != nil {
		return apperr.BadRequest("backup could not be opened as a SQLite database")
	}
	defer conn.ExecContext(context.Background(), `DETACH DATABASE restore_src`)

	// The snapshot must be at the same schema version as the running server.
	var mismatch int
	err = conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM (
		SELECT version FROM main.schema_migrations EXCEPT SELECT version FROM restore_src.schema_migrations
		UNION ALL
		SELECT version FROM restore_src.schema_migrations EXCEPT SELECT version FROM main.schema_migrations)`).Scan(&mismatch)
	if err != nil {
		return apperr.BadRequest("backup does not contain an Xpenses database")
	}
	if mismatch != 0 {
		return apperr.BadRequest("backup was made with a different schema version and cannot be restored by this server")
	}
	// Foreign keys are disabled for the copy; the snapshot was itself consistent.
	if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys = OFF`); err != nil {
		return apperr.Internal(err)
	}
	defer conn.ExecContext(context.Background(), `PRAGMA foreign_keys = ON`)
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return apperr.Internal(err)
	}
	for i := len(restoreTables) - 1; i >= 0; i-- {
		if _, err := tx.ExecContext(ctx, `DELETE FROM main.`+restoreTables[i]); err != nil {
			_ = tx.Rollback()
			return apperr.Internal(err)
		}
	}
	for _, t := range restoreTables {
		if _, err := tx.ExecContext(ctx, `INSERT INTO main.`+t+` SELECT * FROM restore_src.`+t); err != nil {
			_ = tx.Rollback()
			return apperr.BadRequest(fmt.Sprintf("backup table %s is incompatible: %v", t, err))
		}
	}
	var violations int
	_ = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_foreign_key_check`).Scan(&violations)
	if violations > 0 {
		_ = tx.Rollback()
		return apperr.BadRequest("backup contains inconsistent references and was not restored")
	}
	if err := tx.Commit(); err != nil {
		return apperr.Internal(err)
	}
	return nil
}
