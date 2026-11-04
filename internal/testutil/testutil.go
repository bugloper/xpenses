// Package testutil spins up the full API over an in-memory database for
// integration tests, with an authenticated client per user.
package testutil

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"testing"

	"github.com/bugloper/xpensiv/internal/auth"
	"github.com/bugloper/xpensiv/internal/config"
	"github.com/bugloper/xpensiv/internal/database"
	"github.com/bugloper/xpensiv/internal/server"
)

// Password used for every test user.
const Password = "correct-horse-battery"

// Env is a running API server.
type Env struct {
	T    *testing.T
	Srv  *httptest.Server
	DB   *sql.DB
	Cfg  config.Config
	Deps *server.Deps
}

// New starts the server with every domain handler mounted.
func New(t *testing.T) *Env {
	t.Helper()
	db, err := database.OpenTest()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{DefaultCurrency: "BTN", MaxUploadBytes: 1 << 20, DataDir: t.TempDir(), SecureCookies: "false"}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	deps := server.NewDeps(cfg, db)
	e := server.New(cfg, log, deps, server.ExtraRegistrars(cfg, log, db, deps)...)
	srv := httptest.NewServer(e)
	t.Cleanup(srv.Close)
	return &Env{T: t, Srv: srv, DB: db, Cfg: cfg, Deps: deps}
}

// Client is an HTTP client bound to one user's session cookie.
type Client struct {
	Env    *Env
	HTTP   *http.Client
	UserID string
	Email  string
}

// Setup creates the first (admin) user through POST /auth/setup and returns a
// signed-in client.
func (e *Env) Setup(name, email string) *Client {
	e.T.Helper()
	c := e.anon()
	st, body := c.Do("POST", "/auth/setup", map[string]any{"name": name, "email": email, "password": Password})
	if st != 201 {
		e.T.Fatalf("setup: %d %v", st, body)
	}
	c.UserID = Data(body)["id"].(string)
	c.Email = email
	return c
}

// Register creates an additional user via an admin invite and signs them in.
func (e *Env) Register(admin *Client, name, email string) *Client {
	e.T.Helper()
	st, inv := admin.Do("POST", "/admin/invites", map[string]any{})
	if st != 201 {
		e.T.Fatalf("invite: %d %v", st, inv)
	}
	c := e.anon()
	st, body := c.Do("POST", "/auth/register", map[string]any{"name": name, "email": email, "password": Password, "invite_token": Data(inv)["token"]})
	if st != 201 {
		e.T.Fatalf("register: %d %v", st, body)
	}
	c.UserID = Data(body)["id"].(string)
	c.Email = email
	return c
}

// Anon returns a client with no session.
func (e *Env) Anon() *Client { return e.anon() }

func (e *Env) anon() *Client {
	jar, _ := cookiejar.New(nil)
	return &Client{Env: e, HTTP: &http.Client{Jar: jar}}
}

// Do sends a JSON request and decodes the JSON response (if any).
func (c *Client) Do(method, path string, body any) (int, map[string]any) {
	c.Env.T.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.Env.Srv.URL+"/api/v1"+path, r)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(auth.ClientHeader, "test")
	return c.send(req)
}

// DoRaw sends a request without the CSRF header or JSON content type.
func (c *Client) DoRaw(req *http.Request) (int, map[string]any) {
	c.Env.T.Helper()
	return c.send(req)
}

// Multipart sends a multipart form with the given fields and one file.
func (c *Client) Multipart(path string, fields map[string]string, fileField, fileName string, content []byte) (int, map[string]any) {
	return c.MultipartMethod("POST", path, fields, fileField, fileName, content)
}

// MultipartMethod is Multipart with the HTTP method of your choice.
func (c *Client) MultipartMethod(method, path string, fields map[string]string, fileField, fileName string, content []byte) (int, map[string]any) {
	c.Env.T.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	if fileField != "" {
		fw, _ := w.CreateFormFile(fileField, fileName)
		_, _ = fw.Write(content)
	}
	_ = w.Close()
	req, _ := http.NewRequest(method, c.Env.Srv.URL+"/api/v1"+path, &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set(auth.ClientHeader, "test")
	return c.send(req)
}

// Get fetches raw bytes (for CSV/PDF/file downloads).
func (c *Client) Get(path string) (int, []byte, http.Header) {
	c.Env.T.Helper()
	req, _ := http.NewRequest("GET", c.Env.Srv.URL+"/api/v1"+path, nil)
	res, err := c.HTTP.Do(req)
	if err != nil {
		c.Env.T.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, b, res.Header
}

func (c *Client) send(req *http.Request) (int, map[string]any) {
	res, err := c.HTTP.Do(req)
	if err != nil {
		c.Env.T.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	out := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			c.Env.T.Fatalf("bad json from %s %s: %s", req.Method, req.URL.Path, raw)
		}
	}
	return res.StatusCode, out
}

// Data unwraps the {"data": {...}} envelope.
func Data(m map[string]any) map[string]any { d, _ := m["data"].(map[string]any); return d }

// List unwraps {"data": [...]}.
func List(m map[string]any) []any { d, _ := m["data"].([]any); return d }

// Category returns the id of the user's category with the given name.
func (c *Client) Category(name string) string {
	c.Env.T.Helper()
	st, body := c.Do("GET", "/categories?include_inactive=1", nil)
	if st != 200 {
		c.Env.T.Fatalf("categories: %d %v", st, body)
	}
	for _, x := range List(body) {
		m := x.(map[string]any)
		if m["name"] == name {
			return m["id"].(string)
		}
	}
	c.Env.T.Fatalf("category %q not found", name)
	return ""
}

// CreateAccount creates an account and returns its id.
func (c *Client) CreateAccount(name, typ string, opening int64) string {
	c.Env.T.Helper()
	st, body := c.Do("POST", "/accounts", map[string]any{"name": name, "type": typ, "opening_balance": opening, "opening_balance_date": "2026-01-01"})
	if st != 201 {
		c.Env.T.Fatalf("create account: %d %v", st, body)
	}
	return Data(body)["id"].(string)
}

// Balance returns an account's current balance.
func (c *Client) Balance(id string) int64 {
	c.Env.T.Helper()
	st, body := c.Do("GET", "/accounts/"+id, nil)
	if st != 200 {
		c.Env.T.Fatalf("get account: %d %v", st, body)
	}
	return int64(Data(body)["current_balance"].(float64))
}
