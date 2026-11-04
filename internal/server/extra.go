package server

import (
	"database/sql"
	"log/slog"

	"github.com/bugloper/xpensiv/internal/config"
	"github.com/bugloper/xpensiv/internal/handlers"
	"github.com/bugloper/xpensiv/internal/reconciliation"
	"github.com/bugloper/xpensiv/internal/reports"
	"github.com/bugloper/xpensiv/internal/services"
)

// ExtraRegistrars returns the statement, reconciliation and report handlers.
// Keeping them here means main.go never changes as domains are added.
func ExtraRegistrars(cfg config.Config, log *slog.Logger, db *sql.DB, deps *Deps) []Registrar {
	return []Registrar{
		handlers.NewStatementHandler(services.NewStatementService(db, cfg.StatementsDir()), cfg.MaxUploadBytes),
		handlers.NewReconciliationHandler(reconciliation.NewService(db, deps.Settings)),
		handlers.NewReportHandler(reports.NewService(db)),
	}
}
