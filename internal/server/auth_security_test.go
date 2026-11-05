package server_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/testutil"
)

// The auth gate keys on the decoded URL path while Echo routes on the raw one;
// no spelling of an admin path may slip past the gate.
func TestAdminPathsCannotBeReachedThroughPathTricks(t *testing.T) {
	e := testutil.New(t)
	admin := e.Setup("Owner", "owner@example.com")
	bob := e.Register(admin, "Bob", "bob@example.com")
	paths := []string{
		"/api/v1/auth/login/../admin/users",
		"/api/v1/auth/status/../../admin/users",
		"/api/v1/%61dmin/users",
		"/api/v1/admin%2Fusers",
		"/api/v1//admin/users",
		"/api/v1/auth/login/",
	}
	for _, c := range []*testutil.Client{e.Anon(), bob} {
		for _, p := range paths {
			req, _ := http.NewRequest("GET", e.Srv.URL+p, nil)
			req.Header.Set(auth.ClientHeader, "test")
			st, body := c.DoRaw(req)
			if st == 200 {
				t.Fatalf("%s reachable without admin rights: %d %v", p, st, body)
			}
		}
	}
}

func TestRestoreIsAdminOnly(t *testing.T) {
	e := testutil.New(t)
	admin := e.Setup("Owner", "owner@example.com")
	bob := e.Register(admin, "Bob", "bob@example.com")
	if st, b := bob.Multipart("/restore", nil, "file", "x.db", []byte("SQLite format 3\x00")); st != 403 || b["error"].(map[string]any)["code"] != "forbidden" {
		t.Fatalf("non-admin restore: %d %v", st, b)
	}
	if st, _ := e.Anon().Multipart("/restore", nil, "file", "x.db", []byte("x")); st != 401 {
		t.Fatalf("anonymous restore want 401 got %d", st)
	}
}

func TestAuthBodiesAreCapped(t *testing.T) {
	e := testutil.New(t)
	e.Setup("Owner", "owner@example.com")
	huge := `{"email":"owner@example.com","password":"` + strings.Repeat("a", 64<<10) + `"}`
	req, _ := http.NewRequest("POST", e.Srv.URL+"/api/v1/auth/login", strings.NewReader(huge))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(auth.ClientHeader, "test")
	if st, _ := e.Anon().DoRaw(req); st < 400 || st >= 500 {
		t.Fatalf("oversized login body want 4xx got %d", st)
	}
	// A normal body still works.
	if st, _ := e.Anon().Do("POST", "/auth/login", map[string]any{"email": "owner@example.com", "password": testutil.Password}); st != 200 {
		t.Fatalf("normal login want 200 got %d", st)
	}
}

func TestLoginReplacesExistingSession(t *testing.T) {
	e := testutil.New(t)
	owner := e.Setup("Owner", "owner@example.com")
	bob := e.Register(owner, "Bob", "bob@example.com")
	// Owner's browser, already signed in, signs in again (as Bob this time).
	if st, _ := owner.Do("POST", "/auth/login", map[string]any{"email": "bob@example.com", "password": testutil.Password}); st != 200 {
		t.Fatalf("second login want 200 got %d", st)
	}
	var n int
	_ = e.DB.QueryRow(`SELECT COUNT(*) FROM sessions WHERE user_id = ?`, owner.UserID).Scan(&n)
	if n != 0 {
		t.Fatalf("owner's old session must be revoked on re-login, %d left", n)
	}
	_ = e.DB.QueryRow(`SELECT COUNT(*) FROM sessions WHERE user_id = ?`, bob.UserID).Scan(&n)
	if n != 2 {
		t.Fatalf("bob sessions want 2 got %d", n)
	}
	if st, b := owner.Do("GET", "/auth/me", nil); st != 200 || testutil.Data(b)["email"] != "bob@example.com" {
		t.Fatalf("me after re-login: %d %v", st, b)
	}
}

func TestEmailValidationRejectsLooseForms(t *testing.T) {
	e := testutil.New(t)
	admin := e.Setup("Owner", "owner@example.com")
	admin.Do("PATCH", "/admin/settings", map[string]any{"registration_open": true})
	for _, email := range []string{"a@b", "(note)alice@example.com", `"a b"@example.com`, "Alice <alice@example.com>", strings.Repeat("a", 250) + "@example.com"} {
		st, b := e.Anon().Do("POST", "/auth/register", map[string]any{"name": "A", "email": email, "password": testutil.Password})
		if st != 422 {
			t.Fatalf("email %q: want 422 got %d %v", email, st, b)
		}
	}
	if st, b := e.Anon().Do("POST", "/auth/register", map[string]any{"name": "A", "email": "  Alice.Smith@Example.COM ", "password": testutil.Password}); st != 201 || testutil.Data(b)["email"] != "alice.smith@example.com" {
		t.Fatalf("normalised email: %d %v", st, b)
	}
}
