package config

import (
	"os"
	"testing"
)

func TestCORSOriginExplicitlyEmptyDisablesDevOrigin(t *testing.T) {
	t.Setenv("XPENSIV_CORS_ORIGIN", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CORSOrigin != "" {
		t.Fatalf("XPENSIV_CORS_ORIGIN= must disable CORS, got %q", cfg.CORSOrigin)
	}
}

func TestCORSOriginDefaultsToDevServer(t *testing.T) {
	t.Setenv("XPENSIV_CORS_ORIGIN", "x") // registers the restore; now unset for the default case
	if err := os.Unsetenv("XPENSIV_CORS_ORIGIN"); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CORSOrigin != "http://localhost:5173" {
		t.Fatalf("default CORS origin %q", cfg.CORSOrigin)
	}
}
