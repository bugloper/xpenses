// Package errors defines the application error type that handlers translate
// into consistent HTTP responses.
package errors

import (
	stderrors "errors"
	"fmt"
	"net/http"
)

// Error is an application-level error carrying an HTTP status and a stable code.
type Error struct {
	Status  int               `json:"-"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
	cause   error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Unwrap exposes the wrapped cause.
func (e *Error) Unwrap() error { return e.cause }

// WithCause attaches an underlying error (never surfaced to clients).
func (e *Error) WithCause(err error) *Error {
	c := *e
	c.cause = err
	return &c
}

// WithDetails attaches field-level details (e.g. validation messages).
func (e *Error) WithDetails(d map[string]string) *Error {
	c := *e
	c.Details = d
	return &c
}

func NotFound(what string) *Error {
	return &Error{Status: http.StatusNotFound, Code: "not_found", Message: what + " not found"}
}

func BadRequest(msg string) *Error {
	return &Error{Status: http.StatusBadRequest, Code: "bad_request", Message: msg}
}

func Validation(msg string, details map[string]string) *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "validation_error", Message: msg, Details: details}
}

func Conflict(msg string) *Error {
	return &Error{Status: http.StatusConflict, Code: "conflict", Message: msg}
}

func Internal(err error) *Error {
	return &Error{Status: http.StatusInternalServerError, Code: "internal_error", Message: "internal server error", cause: err}
}

func PayloadTooLarge(msg string) *Error {
	return &Error{Status: http.StatusRequestEntityTooLarge, Code: "payload_too_large", Message: msg}
}

// As extracts an *Error from err, if present.
func As(err error) (*Error, bool) {
	var e *Error
	if stderrors.As(err, &e) {
		return e, true
	}
	return nil, false
}
