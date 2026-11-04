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
	// SecureCookies: auto | true | false. "auto" marks the session cookie Secure
	// only when the request arrived over HTTPS.
	SecureCookies string
	// TrustedProxy: honour X-Forwarded-For / X-Forwarded-Proto from a reverse proxy.
	TrustedProxy bool
	// Tesseract is the OCR binary used to read payment screenshots ("" disables).
	Tesseract string
}

// Load reads configuration from the environment, applying defaults.
func Load() (Config, error) {
	cfg := Config{
		Addr:            getenv("XPENSIV_ADDR", "127.0.0.1:8080"),
		DataDir:         getenv("XPENSIV_DATA_DIR", "./data"),
		MaxUploadBytes:  10 << 20,
		LogLevel:        getenv("XPENSIV_LOG_LEVEL", "info"),
		StaticDir:       getenv("XPENSIV_STATIC_DIR", "./web/dist"),
		CORSOrigin:      corsOrigin(),
		DefaultCurrency: getenv("XPENSIV_DEFAULT_CURRENCY", "BTN"),
		SecureCookies:   getenv("XPENSIV_SECURE_COOKIES", "auto"),
		TrustedProxy:    getenv("XPENSIV_TRUSTED_PROXY", "false") == "true",
		Tesseract:       tesseractBinary(),
	}
	switch cfg.SecureCookies {
	case "auto", "true", "false":
	default:
		return cfg, fmt.Errorf("XPENSIV_SECURE_COOKIES must be auto, true or false")
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

// AttachmentsDir returns where transaction images are kept.
func (c Config) AttachmentsDir() string { return c.DataDir + "/attachments" }

// BackupsDir returns where backups are written.
func (c Config) BackupsDir() string { return c.DataDir + "/backups" }

// corsOrigin defaults to the Vite dev origin but, unlike getenv, honours an
// explicitly empty XPENSIV_CORS_ORIGIN= (the documented production setting).
func corsOrigin() string {
	if v, ok := os.LookupEnv("XPENSIV_CORS_ORIGIN"); ok {
		return v
	}
	return "http://localhost:5173"
}

// tesseractBinary honours an explicitly empty XPENSIV_TESSERACT= (OCR off).
func tesseractBinary() string {
	if v, ok := os.LookupEnv("XPENSIV_TESSERACT"); ok {
		return v
	}
	return "tesseract"
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
