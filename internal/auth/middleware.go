package auth

import (
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
)

const (
	CookieName   = "xpenses_session"
	ClientHeader = "X-Xpenses-Client"
	ctxUserKey   = "auth_user"
	ctxTokenKey  = "auth_token"
)

// Middleware resolves the session cookie on every request, enforces CSRF
// rules on mutations and offers RequireAuth / RequireAdmin gates.
type Middleware struct {
	Svc *Service
	// SecureCookies: "auto" (Secure when the request is HTTPS), "true", "false".
	SecureCookies string
	// TrustedProxy enables X-Forwarded-For / X-Forwarded-Proto handling.
	TrustedProxy bool
	// AllowedOrigin is an extra origin accepted by the CSRF check (dev server).
	AllowedOrigin string
}

// APIPrefix is the path under which Protect applies.
const APIPrefix = "/api/v1"

// publicPaths (relative to APIPrefix) need no session.
var publicPaths = map[string]bool{
	"/health": true, "/auth/status": true, "/auth/setup": true, "/auth/register": true, "/auth/login": true, "/auth/reset-password": true,
}

// expiredAllowed are the paths a user whose free year has ended may still
// call: enough to see who they are, sign out and manage their sessions.
var expiredAllowed = map[string]bool{
	"/auth/me": true, "/auth/me/avatar": true, "/auth/logout": true, "/auth/logout-all": true, "/auth/sessions": true, "/auth/password": true,
}

// adminOnly reports whether a relative API path is restricted to administrators.
func adminOnly(rel string) bool {
	return strings.HasPrefix(rel, "/admin/") || rel == "/backup" || rel == "/restore"
}

// Protect is installed with e.Use (never on a Group, which would add catch-all
// routes and break 404/405 semantics). For API requests it enforces CSRF,
// resolves the session cookie into the context, and gates private and admin
// paths. Non-API requests (the SPA) pass straight through.
func (m *Middleware) Protect() echo.MiddlewareFunc {
	resolve := m.Resolve()
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		gated := resolve(func(c echo.Context) error {
			rel := strings.TrimPrefix(c.Request().URL.Path, APIPrefix)
			if publicPaths[rel] {
				return next(c)
			}
			if adminOnly(rel) {
				return RequireAdmin(next)(c)
			}
			return RequireAuth(next)(c)
		})
		return func(c echo.Context) error {
			p := c.Request().URL.Path
			if p != APIPrefix && !strings.HasPrefix(p, APIPrefix+"/") {
				return next(c)
			}
			return gated(c)
		}
	}
}

// Resolve loads the user for the session cookie (if any) into the context. It
// never rejects: RequireAuth does that. It also enforces the CSRF rules.
func (m *Middleware) Resolve() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if err := m.csrf(c); err != nil {
				return err
			}
			tok := ""
			if ck, err := c.Cookie(CookieName); err == nil {
				tok = ck.Value
			}
			if tok != "" {
				_, u, err := m.Svc.Authenticate(c.Request().Context(), tok)
				if err != nil {
					m.ClearCookie(c)
					return err
				}
				if u != nil {
					c.Set(ctxUserKey, u)
					c.Set(ctxTokenKey, tok)
					c.SetRequest(c.Request().WithContext(WithUser(c.Request().Context(), u)))
				} else {
					m.ClearCookie(c)
				}
			}
			return next(c)
		}
	}
}

func (m *Middleware) csrf(c echo.Context) error {
	switch c.Request().Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return nil
	}
	if c.Request().Header.Get(ClientHeader) == "" {
		return &apperr.Error{Status: http.StatusForbidden, Code: "csrf_rejected", Message: "missing " + ClientHeader + " header"}
	}
	if origin := c.Request().Header.Get("Origin"); origin != "" && origin != "null" {
		if !m.originAllowed(c, origin) {
			return &apperr.Error{Status: http.StatusForbidden, Code: "csrf_rejected", Message: "request origin is not allowed"}
		}
	}
	return nil
}

func (m *Middleware) originAllowed(c echo.Context, origin string) bool {
	if m.AllowedOrigin != "" && origin == m.AllowedOrigin {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	// A page served over HTTPS always reports an https origin; an http origin
	// on a secure request can only come from a plaintext (MITM-able) page.
	if m.IsSecure(c) && !strings.EqualFold(u.Scheme, "https") {
		return false
	}
	return strings.EqualFold(u.Host, c.Request().Host)
}

// RequireAuth rejects anonymous requests with 401.
func RequireAuth(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		u := CurrentUser(c)
		if u == nil {
			return &apperr.Error{Status: http.StatusUnauthorized, Code: "unauthenticated", Message: "sign in to continue"}
		}
		if AccessExpired(u, time.Now()) {
			rel := strings.TrimPrefix(c.Request().URL.Path, APIPrefix)
			if !expiredAllowed[rel] && !strings.HasPrefix(rel, "/auth/sessions/") {
				return &apperr.Error{Status: http.StatusForbidden, Code: "access_expired", Message: "your free year has ended; ask the administrator to extend your access"}
			}
		}
		return next(c)
	}
}

// RequireAdmin rejects non-admin users with 403.
func RequireAdmin(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		u := CurrentUser(c)
		if u == nil {
			return &apperr.Error{Status: http.StatusUnauthorized, Code: "unauthenticated", Message: "sign in to continue"}
		}
		if u.Role != models.RoleAdmin {
			return &apperr.Error{Status: http.StatusForbidden, Code: "forbidden", Message: "administrator access required"}
		}
		return next(c)
	}
}

// CurrentUser returns the signed-in user for the request, or nil.
func CurrentUser(c echo.Context) *models.User {
	u, _ := c.Get(ctxUserKey).(*models.User)
	return u
}

// CurrentToken returns the raw session token for the request.
func CurrentToken(c echo.Context) string {
	t, _ := c.Get(ctxTokenKey).(string)
	return t
}

// IsSecure reports whether the request arrived over HTTPS (directly or via a trusted proxy).
func (m *Middleware) IsSecure(c echo.Context) bool {
	if c.Request().TLS != nil {
		return true
	}
	if m.TrustedProxy && strings.EqualFold(c.Request().Header.Get("X-Forwarded-Proto"), "https") {
		return true
	}
	return false
}

// ClientIP returns the caller's IP, honouring X-Forwarded-For only behind a
// trusted proxy. TrustedProxy means exactly one proxy hop sits in front, so the
// trustworthy address is the LAST entry (the one that proxy appended); earlier
// entries are whatever the client sent and could be forged to dodge or redirect
// the per-IP login throttle.
func (m *Middleware) ClientIP(c echo.Context) string {
	if m.TrustedProxy {
		if xff := c.Request().Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(c.Request().RemoteAddr)
	if err != nil {
		return c.Request().RemoteAddr
	}
	return host
}

// SetCookie writes the session cookie.
func (m *Middleware) SetCookie(c echo.Context, token string) {
	secure := false
	switch m.SecureCookies {
	case "true":
		secure = true
	case "false":
		secure = false
	default:
		secure = m.IsSecure(c)
	}
	c.SetCookie(&http.Cookie{
		Name: CookieName, Value: token, Path: "/", HttpOnly: true, Secure: secure,
		SameSite: http.SameSiteStrictMode, MaxAge: int(SessionAbsolute / time.Second),
	})
}

// ClearCookie removes the session cookie.
func (m *Middleware) ClearCookie(c echo.Context) {
	c.SetCookie(&http.Cookie{Name: CookieName, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
}
