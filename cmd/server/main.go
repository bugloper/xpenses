// Command server runs the Xpensiv API and serves the built frontend.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bugloper/xpensiv/internal/config"
	"github.com/bugloper/xpensiv/internal/database"
	"github.com/bugloper/xpensiv/internal/server"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	level := slog.LevelInfo
	switch cfg.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))

	for _, d := range []string{cfg.DataDir, cfg.StatementsDir(), cfg.BackupsDir()} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return err
		}
	}
	db, err := database.Open(cfg.DBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	if err := database.Migrate(context.Background(), db); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	deps := server.NewDeps(cfg, db)
	e := server.New(cfg, log, deps, server.ExtraRegistrars(cfg, log, db, deps)...)

	// Generate any due recurring transactions at startup and then once a day.
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for {
			if res, err := deps.Recurring.Generate(context.Background(), ""); err != nil {
				log.Warn("recurring generation failed", "err", err)
			} else if res.Generated > 0 {
				log.Info("recurring transactions generated", "count", res.Generated)
			}
			<-ticker.C
		}
	}()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           e,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		log.Info("xpensiv listening", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-errCh:
		return err
	case <-stop:
	}
	log.Info("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}
