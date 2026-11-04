package services

import (
	"context"
	"database/sql"
	"strconv"

	"github.com/bugloper/xpensiv/internal/auth"
	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/repositories"
)

// Setting keys.
const (
	SettingDateTolerance   = "reconciliation.date_tolerance_days"
	SettingDefaultCurrency = "default_currency"
	SettingLastAccount     = "ui.last_account_id"
	SettingLastCategory    = "ui.last_category_id"
	SettingTheme           = "ui.theme"
)

var allowedSettings = map[string]bool{
	SettingDateTolerance: true, SettingDefaultCurrency: true, SettingLastAccount: true, SettingLastCategory: true, SettingTheme: true,
}

type SettingsService struct {
	DB   *sql.DB
	Repo repositories.SettingsRepo
}

// Defaults applied when a user has not set a key.
var settingDefaults = map[string]string{SettingDateTolerance: "3", SettingDefaultCurrency: "BTN"}

func (s *SettingsService) All(ctx context.Context) (map[string]string, error) {
	vals, err := s.Repo.All(ctx, s.DB, auth.UserID(ctx))
	if err != nil {
		return nil, err
	}
	for k, v := range settingDefaults {
		if _, ok := vals[k]; !ok {
			vals[k] = v
		}
	}
	return vals, nil
}

func (s *SettingsService) Update(ctx context.Context, values map[string]string) (map[string]string, error) {
	for k, v := range values {
		if !allowedSettings[k] {
			return nil, apperr.Validation("unknown setting", map[string]string{k: "is not a recognised setting"})
		}
		if k == SettingDateTolerance {
			n, err := strconv.Atoi(v)
			if err != nil || n < 0 || n > 31 {
				return nil, apperr.Validation("validation failed", map[string]string{k: "must be an integer between 0 and 31"})
			}
		}
		if len(v) > 200 {
			return nil, apperr.Validation("validation failed", map[string]string{k: "is too long"})
		}
		if err := s.Repo.Set(ctx, s.DB, auth.UserID(ctx), k, v); err != nil {
			return nil, apperr.Internal(err)
		}
	}
	return s.All(ctx)
}

// DateTolerance returns the reconciliation date tolerance in days.
func (s *SettingsService) DateTolerance(ctx context.Context) int {
	v, err := s.Repo.Get(ctx, s.DB, auth.UserID(ctx), SettingDateTolerance, "3")
	if err != nil {
		return 3
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 3
	}
	return n
}
