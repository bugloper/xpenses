// Package server assembles the Echo application: middleware, services, routes
// and static file serving. It is used by main and by integration tests.
package server

import (
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"github.com/bugloper/xpensiv/internal/config"
	"github.com/bugloper/xpensiv/internal/handlers"
	"github.com/bugloper/xpensiv/internal/middleware"
	"github.com/bugloper/xpensiv/internal/services"
)

// Deps groups the services every handler needs. Build with NewDeps.
type Deps struct {
	Accounts     *services.AccountService
	Categories   *services.CategoryService
	Transactions *services.TransactionService
	Budgets      *services.BudgetService
	Recurring    *services.RecurringService
	Settings     *services.SettingsService
	Backup       *services.BackupService
}

// NewDeps constructs the service graph over db.
func NewDeps(cfg config.Config, db *sql.DB) *Deps {
	return &Deps{
		Accounts:     &services.AccountService{DB: db, DefaultCurrency: cfg.DefaultCurrency},
		Categories:   &services.CategoryService{DB: db},
		Transactions: &services.TransactionService{DB: db, DefaultCurrency: cfg.DefaultCurrency},
		Budgets:      &services.BudgetService{DB: db},
		Recurring:    &services.RecurringService{DB: db, DefaultCurrency: cfg.DefaultCurrency},
		Settings:     &services.SettingsService{DB: db},
		Backup:       &services.BackupService{DB: db, DBPath: cfg.DBPath(), BackupsDir: cfg.BackupsDir()},
	}
}

// Registrar is implemented by every domain handler.
type Registrar interface{ Register(g *echo.Group) }

// New builds the Echo instance. Extra registrars (statements, reconciliation,
// reports) are appended by main so this package stays free of those imports.
func New(cfg config.Config, log *slog.Logger, deps *Deps, extra ...Registrar) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.HTTPErrorHandler = handlers.ErrorHandler(log)
	e.Use(middleware.RequestID())
	e.Use(middleware.Logger(log))
	e.Use(echomw.Recover())
	e.Use(middleware.SecureHeaders())
	e.Use(echomw.BodyLimit(byteCount(cfg.MaxUploadBytes * 12)))
	if cfg.CORSOrigin != "" {
		e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
			AllowOrigins: []string{cfg.CORSOrigin},
			AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPatch, http.MethodDelete, http.MethodOptions},
			AllowHeaders: []string{"Content-Type", "X-Request-ID", "X-Backup-Passphrase"},
		}))
	}

	api := e.Group("/api/v1")
	api.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})
	regs := []Registrar{
		&handlers.AccountHandler{Svc: deps.Accounts},
		&handlers.CategoryHandler{Svc: deps.Categories},
		&handlers.TransactionHandler{Svc: deps.Transactions},
		&handlers.BudgetHandler{Svc: deps.Budgets},
		&handlers.RecurringHandler{Svc: deps.Recurring},
		&handlers.SettingsHandler{Svc: deps.Settings},
		&handlers.BackupHandler{Svc: deps.Backup, MaxUploadBytes: cfg.MaxUploadBytes},
	}
	regs = append(regs, extra...)
	for _, r := range regs {
		r.Register(api)
	}

	if cfg.StaticDir != "" {
		if _, err := os.Stat(filepath.Join(cfg.StaticDir, "index.html")); err == nil {
			serveSPA(e, cfg.StaticDir)
		}
	}
	return e
}

// serveSPA serves the built frontend with history-API fallback to index.html.
// Hashed assets get long cache lifetimes; index.html and the service worker never cache.
func serveSPA(e *echo.Echo, dir string) {
	fs := http.FileServer(http.Dir(dir))
	e.GET("/*", func(c echo.Context) error {
		p := c.Request().URL.Path
		if strings.HasPrefix(p, "/api/") {
			return echo.ErrNotFound
		}
		full := filepath.Join(dir, filepath.Clean("/"+p))
		if st, err := os.Stat(full); err == nil && !st.IsDir() {
			if strings.HasPrefix(p, "/assets/") {
				c.Response().Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				c.Response().Header().Set("Cache-Control", "no-cache")
			}
			fs.ServeHTTP(c.Response(), c.Request())
			return nil
		}
		c.Response().Header().Set("Cache-Control", "no-cache")
		return c.File(filepath.Join(dir, "index.html"))
	})
}

func byteCount(n int64) string { return strconv.FormatInt(n, 10) }
