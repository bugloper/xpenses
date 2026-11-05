package server_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/bugloper/xpenses/internal/auth"
	"github.com/bugloper/xpenses/internal/testutil"
)

func TestSetupLoginLogoutFlow(t *testing.T) {
	e := testutil.New(t)
	anon := e.Anon()
	st, body := anon.Do("GET", "/auth/status", nil)
	if st != 200 || testutil.Data(body)["setup_required"] != true {
		t.Fatalf("status before setup: %d %v", st, body)
	}
	if st, _ := anon.Do("GET", "/accounts", nil); st != 401 {
		t.Fatalf("anonymous data access want 401 got %d", st)
	}
	if st, b := anon.Do("POST", "/auth/login", map[string]any{"email": "x@example.com", "password": testutil.Password}); st != 403 || b["error"].(map[string]any)["code"] != "setup_required" {
		t.Fatalf("login before setup: %d %v", st, b)
	}
	if st, b := anon.Do("POST", "/auth/setup", map[string]any{"name": "O", "email": "owner@example.com", "password": "short"}); st != 422 || b["error"].(map[string]any)["details"].(map[string]any)["password"] == nil {
		t.Fatalf("weak password: %d %v", st, b)
	}
	owner := e.Setup("Owner", "Owner@Example.com")
	st, body = owner.Do("GET", "/auth/me", nil)
	if st != 200 || testutil.Data(body)["role"] != "admin" || testutil.Data(body)["email"] != "owner@example.com" {
		t.Fatalf("me: %d %v", st, body)
	}
	if _, ok := testutil.Data(body)["password_hash"]; ok {
		t.Fatal("password hash leaked")
	}
	if st, _ := e.Anon().Do("POST", "/auth/setup", map[string]any{"name": "X", "email": "x@example.com", "password": testutil.Password}); st != 409 {
		t.Fatalf("second setup want 409 got %d", st)
	}
	// Default categories seeded for the owner.
	if st, b := owner.Do("GET", "/categories", nil); st != 200 || len(testutil.List(b)) != auth.DefaultCategoryCount() {
		t.Fatalf("default categories: %d %d", st, len(testutil.List(b)))
	}
	// Login with wrong then right password on a fresh client.
	c := e.Anon()
	if st, b := c.Do("POST", "/auth/login", map[string]any{"email": "owner@example.com", "password": "nope-nope-nope"}); st != 401 || b["error"].(map[string]any)["code"] != "invalid_credentials" {
		t.Fatalf("wrong password: %d %v", st, b)
	}
	if st, _ := c.Do("POST", "/auth/login", map[string]any{"email": "OWNER@example.com", "password": testutil.Password}); st != 200 {
		t.Fatalf("login want 200 got %d", st)
	}
	if st, _ := c.Do("GET", "/accounts", nil); st != 200 {
		t.Fatalf("after login want 200 got %d", st)
	}
	if st, _ := c.Do("POST", "/auth/logout", nil); st != 204 {
		t.Fatalf("logout want 204 got %d", st)
	}
	if st, _ := c.Do("GET", "/accounts", nil); st != 401 {
		t.Fatalf("after logout want 401 got %d", st)
	}
}

func TestLoginThrottling(t *testing.T) {
	e := testutil.New(t)
	e.Setup("Owner", "owner@example.com")
	c := e.Anon()
	var st int
	var body map[string]any
	for i := 0; i < 11; i++ {
		st, body = c.Do("POST", "/auth/login", map[string]any{"email": "owner@example.com", "password": "wrong-wrong-wrong"})
	}
	if st != 429 || body["error"].(map[string]any)["code"] != "too_many_attempts" {
		t.Fatalf("want 429 after 10 failures, got %d %v", st, body)
	}
	// Even the correct password is refused while throttled.
	if st, _ := c.Do("POST", "/auth/login", map[string]any{"email": "owner@example.com", "password": testutil.Password}); st != 429 {
		t.Fatalf("throttled correct password want 429 got %d", st)
	}
}

func TestCSRFHeaderRequired(t *testing.T) {
	e := testutil.New(t)
	owner := e.Setup("Owner", "owner@example.com")
	req, _ := http.NewRequest("POST", e.Srv.URL+"/api/v1/accounts", strings.NewReader(`{"name":"x","type":"cash"}`))
	req.Header.Set("Content-Type", "application/json")
	if st, b := owner.DoRaw(req); st != 403 || b["error"].(map[string]any)["code"] != "csrf_rejected" {
		t.Fatalf("missing header: %d %v", st, b)
	}
	req, _ = http.NewRequest("POST", e.Srv.URL+"/api/v1/accounts", strings.NewReader(`{"name":"x","type":"cash"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(auth.ClientHeader, "web")
	req.Header.Set("Origin", "https://evil.example")
	if st, b := owner.DoRaw(req); st != 403 {
		t.Fatalf("foreign origin: %d %v", st, b)
	}
	// GETs never need the header.
	req, _ = http.NewRequest("GET", e.Srv.URL+"/api/v1/accounts", nil)
	if st, _ := owner.DoRaw(req); st != 200 {
		t.Fatalf("GET without header want 200 got %d", st)
	}
}

func TestSessionCookieFlags(t *testing.T) {
	e := testutil.New(t)
	res, err := http.Post(e.Srv.URL+"/api/v1/auth/status", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	req, _ := http.NewRequest("POST", e.Srv.URL+"/api/v1/auth/setup", strings.NewReader(`{"name":"O","email":"o@example.com","password":"`+testutil.Password+`"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(auth.ClientHeader, "web")
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	var found bool
	for _, ck := range res.Cookies() {
		if ck.Name == auth.CookieName {
			found = true
			if !ck.HttpOnly || ck.SameSite != http.SameSiteStrictMode || ck.Path != "/" || len(ck.Value) < 32 {
				t.Fatalf("cookie flags: %+v", ck)
			}
		}
	}
	if !found {
		t.Fatal("session cookie not set")
	}
}

func TestDataIsolationBetweenUsers(t *testing.T) {
	e := testutil.New(t)
	a := e.Setup("Alice", "alice@example.com")
	b := e.Register(a, "Bob", "bob@example.com")

	aAcct := a.CreateAccount("Alice bank", "bank", 100000)
	_, tx := a.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": 500, "account_id": aAcct, "category_id": a.Category("Eating out"), "transaction_date": "2026-11-01", "tags": []string{"shared"}})
	aTx := testutil.Data(tx)["id"].(string)

	// Bob sees nothing of Alice's: only his own seeded Cash account.
	if st, body := b.Do("GET", "/accounts", nil); st != 200 || len(testutil.List(body)) != 1 || testutil.List(body)[0].(map[string]any)["name"] != "Cash" {
		t.Fatalf("bob accounts: %d %v", st, body)
	}
	if st, body := b.Do("GET", "/transactions", nil); st != 200 || len(body["data"].([]any)) != 0 {
		t.Fatalf("bob transactions: %d %v", st, body)
	}
	for _, p := range []string{"/accounts/" + aAcct, "/transactions/" + aTx} {
		if st, _ := b.Do("GET", p, nil); st != 404 {
			t.Fatalf("bob GET %s want 404 got %d", p, st)
		}
	}
	if st, _ := b.Do("PATCH", "/transactions/"+aTx, map[string]any{"payee": "hijack"}); st != 404 {
		t.Fatalf("bob PATCH want 404 got %d", st)
	}
	if st, _ := b.Do("DELETE", "/transactions/"+aTx, nil); st != 404 {
		t.Fatalf("bob DELETE want 404 got %d", st)
	}
	// Bob cannot post into Alice's account or use her categories.
	if st, body := b.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": 1, "account_id": aAcct, "transaction_date": "2026-11-01"}); st != 422 {
		t.Fatalf("bob post into alice account: %d %v", st, body)
	}
	bAcct := b.CreateAccount("Bob cash", "cash", 0)
	if st, body := b.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": 1, "account_id": bAcct, "category_id": a.Category("Eating out"), "transaction_date": "2026-11-01"}); st != 422 {
		t.Fatalf("bob use alice category: %d %v", st, body)
	}
	// Same tag name and same client_id are independent per user.
	if st, _ := b.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": 7, "account_id": bAcct, "transaction_date": "2026-11-01", "tags": []string{"shared"}, "client_id": "same-client-id"}); st != 201 {
		t.Fatalf("bob tag/client_id: %d", st)
	}
	if st, _ := a.Do("POST", "/transactions", map[string]any{"type": "expense", "amount": 9, "account_id": aAcct, "transaction_date": "2026-11-01", "client_id": "same-client-id"}); st != 201 {
		t.Fatalf("alice same client_id want 201 got %d", st)
	}
	// Settings and budgets are per user.
	a.Do("PATCH", "/settings", map[string]any{"ui.theme": "dark"})
	if st, body := b.Do("GET", "/settings", nil); st != 200 || testutil.Data(body)["ui.theme"] != nil {
		t.Fatalf("bob settings: %d %v", st, body)
	}
	a.Do("POST", "/budgets", map[string]any{"category_id": a.Category("Eating out"), "amount": 100})
	if st, body := b.Do("GET", "/budgets", nil); st != 200 || len(testutil.List(body)) != 0 {
		t.Fatalf("bob budgets: %d %v", st, body)
	}
	// Alice's balance is untouched by Bob's activity.
	if got := a.Balance(aAcct); got != 100000-500-9 {
		t.Fatalf("alice balance %d", got)
	}
}

func TestAdminAndInvites(t *testing.T) {
	e := testutil.New(t)
	admin := e.Setup("Owner", "owner@example.com")
	// Registration closed by default.
	if st, b := e.Anon().Do("POST", "/auth/register", map[string]any{"name": "X", "email": "x@example.com", "password": testutil.Password}); st != 403 || b["error"].(map[string]any)["code"] != "registration_closed" {
		t.Fatalf("closed registration: %d %v", st, b)
	}
	// Invite flow; email-bound invite rejects other emails and is single use.
	st, inv := admin.Do("POST", "/admin/invites", map[string]any{"email": "bob@example.com"})
	if st != 201 || !strings.HasPrefix(testutil.Data(inv)["register_path"].(string), "/register?invite=") {
		t.Fatalf("invite: %d %v", st, inv)
	}
	token := testutil.Data(inv)["token"].(string)
	if st, b := e.Anon().Do("POST", "/auth/register", map[string]any{"name": "Eve", "email": "eve@example.com", "password": testutil.Password, "invite_token": token}); st != 400 || b["error"].(map[string]any)["code"] != "invalid_invite" {
		t.Fatalf("invite wrong email: %d %v", st, b)
	}
	bob := e.Anon()
	if st, _ := bob.Do("POST", "/auth/register", map[string]any{"name": "Bob", "email": "bob@example.com", "password": testutil.Password, "invite_token": token}); st != 201 {
		t.Fatalf("invite register: %d", st)
	}
	if st, _ := e.Anon().Do("POST", "/auth/register", map[string]any{"name": "Bob2", "email": "bob2@example.com", "password": testutil.Password, "invite_token": token}); st != 400 {
		t.Fatalf("invite reuse want 400 got %d", st)
	}
	st, list := admin.Do("GET", "/admin/invites", nil)
	if st != 200 || testutil.List(list)[0].(map[string]any)["used_by_email"] != "bob@example.com" {
		t.Fatalf("invite list: %d %v", st, list)
	}
	// Non-admin is locked out of admin routes and backup.
	for _, p := range []string{"/admin/users", "/admin/invites", "/backup"} {
		if st, b := bob.Do("GET", p, nil); st != 403 || b["error"].(map[string]any)["code"] != "forbidden" {
			t.Fatalf("bob %s: %d %v", p, st, b)
		}
	}
	// Open registration, register without invite.
	if st, b := admin.Do("PATCH", "/admin/settings", map[string]any{"registration_open": true}); st != 200 || testutil.Data(b)["registration_open"] != true {
		t.Fatalf("open registration: %d %v", st, b)
	}
	if st, _ := e.Anon().Do("POST", "/auth/register", map[string]any{"name": "Carol", "email": "carol@example.com", "password": testutil.Password}); st != 201 {
		t.Fatalf("open register want 201 got %d", st)
	}
	if st, b := e.Anon().Do("POST", "/auth/register", map[string]any{"name": "Carol", "email": "carol@example.com", "password": testutil.Password}); st != 409 || b["error"].(map[string]any)["code"] != "email_taken" {
		t.Fatalf("duplicate email: %d %v", st, b)
	}
	// Admin user management.
	st, users := admin.Do("GET", "/admin/users", nil)
	if st != 200 || len(testutil.List(users)) != 3 {
		t.Fatalf("users: %d %v", st, users)
	}
	var bobID string
	for _, u := range testutil.List(users) {
		if u.(map[string]any)["email"] == "bob@example.com" {
			bobID = u.(map[string]any)["id"].(string)
		}
	}
	if st, _ := admin.Do("PATCH", "/admin/users/"+admin.UserID, map[string]any{"is_active": false}); st != 422 {
		t.Fatalf("self-disable want 422 got %d", st)
	}
	if st, _ := admin.Do("PATCH", "/admin/users/"+bobID, map[string]any{"is_active": false}); st != 200 {
		t.Fatalf("disable bob want 200 got %d", st)
	}
	// Bob's existing session is revoked and login is refused.
	if st, _ := bob.Do("GET", "/accounts", nil); st != 401 {
		t.Fatalf("disabled session want 401 got %d", st)
	}
	if st, b := e.Anon().Do("POST", "/auth/login", map[string]any{"email": "bob@example.com", "password": testutil.Password}); st != 403 || b["error"].(map[string]any)["code"] != "account_disabled" {
		t.Fatalf("disabled login: %d %v", st, b)
	}
	// Delete user cascades their data.
	bobAcct := 0
	_ = e.DB.QueryRow(`SELECT COUNT(*) FROM categories WHERE user_id = ?`, bobID).Scan(&bobAcct)
	if bobAcct != auth.DefaultCategoryCount() {
		t.Fatalf("bob categories before delete %d", bobAcct)
	}
	if st, _ := admin.Do("DELETE", "/admin/users/"+bobID, nil); st != 204 {
		t.Fatalf("delete bob want 204 got %d", st)
	}
	_ = e.DB.QueryRow(`SELECT COUNT(*) FROM categories WHERE user_id = ?`, bobID).Scan(&bobAcct)
	if bobAcct != 0 {
		t.Fatalf("bob categories after delete %d", bobAcct)
	}
	if st, _ := admin.Do("DELETE", "/admin/users/"+admin.UserID, nil); st != 422 {
		t.Fatalf("self-delete want 422 got %d", st)
	}
}

func TestPasswordChangeAndSessions(t *testing.T) {
	e := testutil.New(t)
	owner := e.Setup("Owner", "owner@example.com")
	other := e.Anon()
	if st, _ := other.Do("POST", "/auth/login", map[string]any{"email": "owner@example.com", "password": testutil.Password}); st != 200 {
		t.Fatal(st)
	}
	st, list := owner.Do("GET", "/auth/sessions", nil)
	if st != 200 || len(testutil.List(list)) != 2 {
		t.Fatalf("sessions: %d %v", st, list)
	}
	var current int
	for _, s := range testutil.List(list) {
		if s.(map[string]any)["current"] == true {
			current++
		}
	}
	if current != 1 {
		t.Fatalf("current sessions %d", current)
	}
	if st, _ := owner.Do("PATCH", "/auth/password", map[string]any{"current_password": "wrong-wrong-wrong", "new_password": "another-strong-one"}); st != 401 {
		t.Fatalf("wrong current want 401 got %d", st)
	}
	if st, _ := owner.Do("PATCH", "/auth/password", map[string]any{"current_password": testutil.Password, "new_password": "another-strong-one"}); st != 204 {
		t.Fatalf("change want 204 got %d", st)
	}
	// The other session is revoked; the current one survives.
	if st, _ := other.Do("GET", "/accounts", nil); st != 401 {
		t.Fatalf("other session want 401 got %d", st)
	}
	if st, _ := owner.Do("GET", "/accounts", nil); st != 200 {
		t.Fatalf("current session want 200 got %d", st)
	}
	if st, _ := e.Anon().Do("POST", "/auth/login", map[string]any{"email": "owner@example.com", "password": "another-strong-one"}); st != 200 {
		t.Fatalf("login with new password want 200 got %d", st)
	}
	if st, _ := owner.Do("POST", "/auth/logout-all", nil); st != 204 {
		t.Fatal(st)
	}
	if st, _ := owner.Do("GET", "/accounts", nil); st != 401 {
		t.Fatalf("after logout-all want 401 got %d", st)
	}
}

func TestPasswordReset(t *testing.T) {
	e := testutil.New(t)
	admin := e.Setup("Owner", "owner@example.com")
	st, inv := admin.Do("POST", "/admin/invites", map[string]any{"email": "bob@example.com"})
	if st != 201 {
		t.Fatalf("invite: %d %v", st, inv)
	}
	bob := e.Anon()
	if st, _ := bob.Do("POST", "/auth/register", map[string]any{"name": "Bob", "email": "bob@example.com", "password": testutil.Password, "invite_token": testutil.Data(inv)["token"]}); st != 201 {
		t.Fatalf("register: %d", st)
	}
	st, users := admin.Do("GET", "/admin/users", nil)
	var bobID string
	for _, u := range testutil.List(users) {
		if u.(map[string]any)["email"] == "bob@example.com" {
			bobID = u.(map[string]any)["id"].(string)
		}
	}
	// Only an admin can issue a reset link, and only for a real user.
	if st, _ := bob.Do("POST", "/admin/users/"+bobID+"/password-reset", nil); st != 403 {
		t.Fatalf("user issuing reset want 403 got %d", st)
	}
	if st, _ := admin.Do("POST", "/admin/users/nope/password-reset", nil); st != 404 {
		t.Fatalf("reset for unknown user want 404 got %d", st)
	}
	st, created := admin.Do("POST", "/admin/users/"+bobID+"/password-reset", nil)
	if st != 201 || !strings.HasPrefix(testutil.Data(created)["reset_path"].(string), "/reset-password?token=") {
		t.Fatalf("create reset: %d %v", st, created)
	}
	token := testutil.Data(created)["token"].(string)
	anon := e.Anon()
	// Weak password and bad token are rejected without spending the link.
	if st, _ := anon.Do("POST", "/auth/reset-password", map[string]any{"token": token, "new_password": "short"}); st != 422 {
		t.Fatalf("weak password want 422 got %d", st)
	}
	if st, b := anon.Do("POST", "/auth/reset-password", map[string]any{"token": "wrong", "new_password": "a-new-password-123"}); st != 400 || b["error"].(map[string]any)["code"] != "invalid_reset" {
		t.Fatalf("bad token: %d %v", st, b)
	}
	if st, _ := anon.Do("POST", "/auth/reset-password", map[string]any{"token": token, "new_password": "a-new-password-123"}); st != 204 {
		t.Fatalf("reset want 204 got %d", st)
	}
	// Bob's old session is gone, the old password no longer works, the new one does, the link is spent.
	if st, _ := bob.Do("GET", "/auth/me", nil); st != 401 {
		t.Fatalf("old session after reset want 401 got %d", st)
	}
	if st, _ := e.Anon().Do("POST", "/auth/login", map[string]any{"email": "bob@example.com", "password": testutil.Password}); st != 401 {
		t.Fatalf("old password want 401 got %d", st)
	}
	if st, _ := e.Anon().Do("POST", "/auth/login", map[string]any{"email": "bob@example.com", "password": "a-new-password-123"}); st != 200 {
		t.Fatalf("new password want 200 got %d", st)
	}
	if st, _ := e.Anon().Do("POST", "/auth/reset-password", map[string]any{"token": token, "new_password": "another-password-123"}); st != 400 {
		t.Fatalf("reuse want 400 got %d", st)
	}
}
