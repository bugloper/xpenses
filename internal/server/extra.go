package server

import (
	"database/sql"
	"log/slog"

	"github.com/bugloper/xpensiv/internal/config"
)

// ExtraRegistrars returns the statement, reconciliation and report handlers.
// It is filled in once those packages exist; keeping it here means main.go
// never changes.
func ExtraRegistrars(cfg config.Config, log *slog.Logger, db *sql.DB, deps *Deps) []Registrar {
	return nil
}
