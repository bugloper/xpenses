// Package validators collects field-level validation errors.
package validators

import (
	"regexp"
	"strings"

	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
)

// Errors accumulates field errors.
type Errors map[string]string

func (e Errors) Add(field, msg string) { e[field] = msg }

// Err returns a validation error if any field failed, else nil.
func (e Errors) Err() error {
	if len(e) == 0 {
		return nil
	}
	return apperr.Validation("validation failed", e)
}

var colorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (e Errors) Required(field, v string) {
	if strings.TrimSpace(v) == "" {
		e.Add(field, "is required")
	}
}

func (e Errors) Date(field, v string) {
	if v == "" {
		return
	}
	if _, err := models.ParseDate(v); err != nil {
		e.Add(field, "must be a date in YYYY-MM-DD format")
	}
}

func (e Errors) OneOf(field, v string, allowed ...string) {
	for _, a := range allowed {
		if a == v {
			return
		}
	}
	e.Add(field, "must be one of: "+strings.Join(allowed, ", "))
}

func (e Errors) Positive(field string, v int64) {
	if v <= 0 {
		e.Add(field, "must be greater than zero")
	}
}

func (e Errors) Color(field, v string) {
	if v != "" && !colorRe.MatchString(v) {
		e.Add(field, "must be a hex color like #22c55e")
	}
}

func (e Errors) MaxLen(field, v string, n int) {
	if len(v) > n {
		e.Add(field, "is too long")
	}
}

func (e Errors) Currency(field, v string) {
	if len(v) != 3 || strings.ToUpper(v) != v {
		e.Add(field, "must be a 3-letter ISO currency code")
	}
}
