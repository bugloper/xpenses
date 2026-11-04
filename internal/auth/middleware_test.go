package auth

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
)

func ctxFor(req *http.Request) echo.Context {
	return echo.New().NewContext(req, httptest.NewRecorder())
}

func TestClientIPIgnoresForwardedForWithoutTrustedProxy(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	req.RemoteAddr = "203.0.113.9:4444"
	req.Header.Set("X-Forwarded-For", "10.0.0.1")
	m := &Middleware{TrustedProxy: false}
	if got := m.ClientIP(ctxFor(req)); got != "203.0.113.9" {
		t.Fatalf("untrusted proxy: want remote addr, got %q", got)
	}
}

func TestClientIPUsesLastForwardedForHopBehindTrustedProxy(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	req.RemoteAddr = "172.16.0.2:1234" // the proxy
	// A client that forges its own X-Forwarded-For; the proxy appends the real address.
	req.Header.Set("X-Forwarded-For", "1.2.3.4, 198.51.100.7")
	m := &Middleware{TrustedProxy: true}
	if got := m.ClientIP(ctxFor(req)); got != "198.51.100.7" {
		t.Fatalf("trusted proxy: want last hop, got %q", got)
	}
	req.Header.Set("X-Forwarded-For", "198.51.100.7")
	if got := m.ClientIP(ctxFor(req)); got != "198.51.100.7" {
		t.Fatalf("single entry: got %q", got)
	}
}

func TestOriginAllowedRequiresHTTPSOnSecureRequest(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/accounts", nil)
	req.Host = "money.example.com"
	req.TLS = &tls.ConnectionState{}
	m := &Middleware{}
	if m.originAllowed(ctxFor(req), "http://money.example.com") {
		t.Fatal("http origin must be rejected on an https request")
	}
	if !m.originAllowed(ctxFor(req), "https://money.example.com") {
		t.Fatal("matching https origin must be accepted")
	}
	if m.originAllowed(ctxFor(req), "https://money.example.com:8443") {
		t.Fatal("origin with a different port must be rejected")
	}
	// Behind a trusted proxy the scheme comes from X-Forwarded-Proto.
	req = httptest.NewRequest(http.MethodPost, "/api/v1/accounts", nil)
	req.Host = "money.example.com"
	req.Header.Set("X-Forwarded-Proto", "https")
	m = &Middleware{TrustedProxy: true}
	if m.originAllowed(ctxFor(req), "http://money.example.com") {
		t.Fatal("http origin must be rejected behind an https proxy")
	}
	// Plain http (dev) still accepts an http origin on the same host.
	req = httptest.NewRequest(http.MethodPost, "/api/v1/accounts", nil)
	req.Host = "localhost:8080"
	if !(&Middleware{}).originAllowed(ctxFor(req), "http://localhost:8080") {
		t.Fatal("same-host http origin must be accepted over plain http")
	}
}
