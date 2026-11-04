// Package middleware provides request-scoped Echo middleware.
package middleware

import (
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

const RequestIDHeader = "X-Request-ID"

// RequestID attaches a request id to every request/response.
func RequestID() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			id := c.Request().Header.Get(RequestIDHeader)
			if id == "" || len(id) > 64 {
				id = uuid.NewString()
			}
			c.Set("request_id", id)
			c.Response().Header().Set(RequestIDHeader, id)
			return next(c)
		}
	}
}

// GetRequestID returns the id set by RequestID.
func GetRequestID(c echo.Context) string {
	if v, ok := c.Get("request_id").(string); ok {
		return v
	}
	return ""
}

// Logger emits one structured log line per request. It deliberately logs only
// method, path, status, duration and request id: never query strings, bodies
// or headers, which may contain financial data.
func Logger(log *slog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			err := next(c)
			status := c.Response().Status
			attrs := []any{
				"method", c.Request().Method,
				"path", c.Request().URL.Path,
				"status", status,
				"duration_ms", time.Since(start).Milliseconds(),
				"request_id", GetRequestID(c),
			}
			switch {
			case status >= 500:
				log.Error("request", attrs...)
			case status >= 400:
				log.Warn("request", attrs...)
			default:
				log.Info("request", attrs...)
			}
			return err
		}
	}
}

// SecureHeaders sets conservative browser security headers.
func SecureHeaders() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			h := c.Response().Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "no-referrer")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			h.Set("Cross-Origin-Opener-Policy", "same-origin")
			if c.Request().URL.Path == "/" || !isAPI(c.Request().URL.Path) {
				// The SPA bundles everything; no external origins are needed.
				h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; font-src 'self' data:")
			}
			h.Set("Cache-Control", "no-store")
			return next(c)
		}
	}
}

func isAPI(p string) bool { return len(p) >= 5 && p[:5] == "/api/" }
