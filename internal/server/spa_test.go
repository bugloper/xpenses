package server_test

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bugloper/xpensiv/internal/config"
	"github.com/bugloper/xpensiv/internal/database"
	"github.com/bugloper/xpensiv/internal/server"
)

func TestSPAServing(t *testing.T) {
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	dir := t.TempDir()
	_ = os.MkdirAll(filepath.Join(dir, "assets"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>app</html>"), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "manifest.webmanifest"), []byte("{}"), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "assets", "app-abc.js"), []byte("1"), 0o644)
	cfg := config.Config{DefaultCurrency: "BTN", MaxUploadBytes: 1 << 20, DataDir: t.TempDir(), StaticDir: dir}
	e := server.New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), server.NewDeps(cfg, db))
	srv := httptest.NewServer(e)
	defer srv.Close()

	get := func(p string) (*http.Response, string) {
		res, err := http.Get(srv.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(res.Body)
		res.Body.Close()
		return res, string(b)
	}
	cases := []struct {
		path, wantBody, wantType, wantCache string
		wantStatus                          int
	}{
		{"/", "app", "text/html", "no-cache", 200},
		{"/reconciliation/some-id", "app", "text/html", "no-cache", 200},
		{"/manifest.webmanifest", "{}", "application/manifest+json", "no-cache", 200},
		{"/assets/app-abc.js", "1", "javascript", "immutable", 200},
		{"/api/v1/does-not-exist", "not_found", "application/json", "no-store", 404},
	}
	for _, c := range cases {
		res, body := get(c.path)
		if res.StatusCode != c.wantStatus || !strings.Contains(body, c.wantBody) ||
			!strings.Contains(res.Header.Get("Content-Type"), c.wantType) || !strings.Contains(res.Header.Get("Cache-Control"), c.wantCache) {
			t.Errorf("%s: status=%d type=%q cache=%q body=%q", c.path, res.StatusCode, res.Header.Get("Content-Type"), res.Header.Get("Cache-Control"), body)
		}
	}
	// Path traversal must not escape the static dir.
	res, _ := get("/../../etc/passwd")
	if res.StatusCode != 200 || !strings.Contains(res.Header.Get("Content-Type"), "text/html") {
		t.Errorf("traversal: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
}
