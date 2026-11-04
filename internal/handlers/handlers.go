// Package handlers wires HTTP requests to services. Handlers only parse input,
// call a service and encode the response.
package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpensiv/internal/dto"
	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/middleware"
)

// ErrorHandler converts errors into the consistent JSON error envelope.
func ErrorHandler(log *slog.Logger) echo.HTTPErrorHandler {
	return func(err error, c echo.Context) {
		if c.Response().Committed {
			return
		}
		body := dto.ErrorResponse{Error: dto.ErrorBody{RequestID: middleware.GetRequestID(c)}}
		status := http.StatusInternalServerError
		if ae, ok := apperr.As(err); ok {
			status = ae.Status
			body.Error.Code = ae.Code
			body.Error.Message = ae.Message
			body.Error.Details = ae.Details
			if status >= 500 {
				log.Error("internal error", "request_id", body.Error.RequestID, "err", errors.Unwrap(ae))
			}
		} else {
			var he *echo.HTTPError
			if errors.As(err, &he) {
				status = he.Code
				body.Error.Code = codeForStatus(he.Code)
				if msg, ok := he.Message.(string); ok {
					body.Error.Message = msg
				} else {
					body.Error.Message = http.StatusText(he.Code)
				}
			} else {
				body.Error.Code = "internal_error"
				body.Error.Message = "internal server error"
				log.Error("unhandled error", "request_id", body.Error.RequestID, "err", err)
			}
		}
		if c.Request().Method == http.MethodHead {
			_ = c.NoContent(status)
			return
		}
		_ = c.JSON(status, body)
	}
}

// codeForStatus gives errors raised by Echo itself (unknown route, wrong
// method, body limit) the same snake_case codes docs/API.md uses for
// application errors.
func codeForStatus(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "bad_request"
	case http.StatusNotFound:
		return "not_found"
	case http.StatusConflict:
		return "conflict"
	case http.StatusRequestEntityTooLarge:
		return "payload_too_large"
	case http.StatusUnprocessableEntity:
		return "validation_error"
	}
	if status >= 500 {
		return "internal_error"
	}
	return strings.ToLower(strings.ReplaceAll(http.StatusText(status), " ", "_"))
}

// bind decodes JSON and maps syntax errors to a 400.
func bind(c echo.Context, v any) error {
	if err := c.Bind(v); err != nil {
		return apperr.BadRequest("invalid JSON body")
	}
	return nil
}

func queryInt(c echo.Context, name string, def int) int {
	v := c.QueryParam(name)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func queryBool(c echo.Context, name string) bool {
	v := c.QueryParam(name)
	return v == "1" || v == "true"
}

// JSON writes a successful response wrapped in {"data": ...}.
func JSON(c echo.Context, status int, data any) error {
	return c.JSON(status, map[string]any{"data": data})
}
