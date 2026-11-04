package services

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/bugloper/xpensiv/internal/database"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	plain := []byte("SQLite format 3\x00 hello")
	enc, err := Encrypt(plain, "correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !IsEncrypted(enc) {
		t.Fatal("missing header")
	}
	dec, err := Decrypt(enc, "correct horse")
	if err != nil || !bytes.Equal(dec, plain) {
		t.Fatalf("round trip failed: %v", err)
	}
	if _, err := Decrypt(enc, "wrong"); err == nil {
		t.Fatal("wrong passphrase accepted")
	}
	if _, err := Decrypt(plain, "x"); err != ErrNotEncrypted {
		t.Fatalf("want ErrNotEncrypted got %v", err)
	}
}

func TestBackupAndRestore(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "x.db")
	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO users (id,email,name,password_hash,role,created_at,updated_at) VALUES ('u1','u@example.com','U','x','admin','x','x')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO accounts (user_id,id,name,type,currency,opening_balance,opening_balance_date,created_at,updated_at) VALUES ('u1','a1','Keep','cash','BTN',100,'2026-01-01','x','x')`); err != nil {
		t.Fatal(err)
	}
	svc := &BackupService{DB: db, DBPath: dbPath, BackupsDir: filepath.Join(dir, "backups")}
	path, err := svc.Create(ctx, "pw")
	if err != nil {
		t.Fatal(err)
	}
	st, _ := os.Stat(path)
	if st.Mode().Perm() != 0o600 {
		t.Fatalf("backup perms %v", st.Mode().Perm())
	}
	// Mutate live data, then restore the snapshot.
	if _, err := db.Exec(`UPDATE accounts SET name='Changed' WHERE id='a1'`); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if err := svc.Restore(ctx, bytes.NewReader(raw), "wrong"); err == nil {
		t.Fatal("wrong passphrase accepted")
	}
	if err := svc.Restore(ctx, bytes.NewReader(raw), "pw"); err != nil {
		t.Fatal(err)
	}
	var name string
	if err := db.QueryRow(`SELECT name FROM accounts WHERE id='a1'`).Scan(&name); err != nil || name != "Keep" {
		t.Fatalf("restore did not revert: %q %v", name, err)
	}
	var n int
	_ = db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	if n != 1 {
		t.Fatalf("users after restore: %d", n)
	}
}
