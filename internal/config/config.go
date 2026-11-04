// Package config loads server configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all runtime settings.
type Config struct {
	Addr            string
	DataDir         string
	MaxUploadBytes  int64
	LogLevel        string
	StaticDir       string
	CORSOrigin      string
	DefaultCurrency string
}

// Load reads configuration from the environment, applying defaults.
func Load() (Config, error) {
	cfg := Config{
		Addr:            getenv("XPENSIV_ADDR", "127.0.0.1:8080"),
		DataDir:         getenv("XPENSIV_DATA_DIR", "./data"),
		MaxUploadBytes:  10 << 20,
		LogLevel:        getenv("XPENSIV_LOG_LEVEL", "info"),
		StaticDir:       getenv("XPENSIV_STATIC_DIR", "./web/dist"),
		CORSOrigin:      getenv("XPENSIV_CORS_ORIGIN", "http://localhost:5173"),
		DefaultCurrency: getenv("XPENSIV_DEFAULT_CURRENCY", "BTN"),
	}
	if v := os.Getenv("XPENSIV_MAX_UPLOAD_BYTES"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			return cfg, fmt.Errorf("XPENSIV_MAX_UPLOAD_BYTES must be a positive integer")
		}
		cfg.MaxUploadBytes = n
	}
	return cfg, nil
}

// DBPath returns the SQLite file path.
func (c Config) DBPath() string { return c.DataDir + "/xpensiv.db" }

// StatementsDir returns where uploaded statement PDFs are kept for auditing.
func (c Config) StatementsDir() string { return c.DataDir + "/statements" }

// BackupsDir returns where backups are written.
func (c Config) BackupsDir() string { return c.DataDir + "/backups" }

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
