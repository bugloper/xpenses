package server

import (
	"database/sql"
	"log/slog"

	"github.com/bugloper/xpenses/internal/config"
	"github.com/bugloper/xpenses/internal/handlers"
	"github.com/bugloper/xpenses/internal/reports"
)

// ExtraRegistrars returns the report handlers. Keeping them here means
// main.go never changes as domains are added.
func ExtraRegistrars(_ config.Config, _ *slog.Logger, db *sql.DB, _ *Deps) []Registrar {
	return []Registrar{handlers.NewReportHandler(reports.NewService(db))}
}
