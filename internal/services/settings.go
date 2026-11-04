package services

import (
	"context"
	"database/sql"

	"github.com/bugloper/xpensiv/internal/auth"
	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/repositories"
)

// Setting keys.
const (
	SettingDefaultCurrency = "default_currency"
	SettingLastAccount     = "ui.last_account_id"
	SettingLastCategory    = "ui.last_category_id"
	SettingTheme           = "ui.theme"
)

var allowedSettings = map[string]bool{
	SettingDefaultCurrency: true, SettingLastAccount: true, SettingLastCategory: true, SettingTheme: true,
}

type SettingsService struct {
	DB   *sql.DB
	Repo repositories.SettingsRepo
}

// Defaults applied when a user has not set a key.
var settingDefaults = map[string]string{SettingDefaultCurrency: "BTN"}

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
		if len(v) > 200 {
			return nil, apperr.Validation("validation failed", map[string]string{k: "is too long"})
		}
		if err := s.Repo.Set(ctx, s.DB, auth.UserID(ctx), k, v); err != nil {
			return nil, apperr.Internal(err)
		}
	}
	return s.All(ctx)
}
