package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpensiv/internal/dto"
	"github.com/bugloper/xpensiv/internal/services"
)

type SettingsHandler struct{ Svc *services.SettingsService }

func (h *SettingsHandler) Register(g *echo.Group) {
	g.GET("/settings", h.Get)
	g.PATCH("/settings", h.Update)
}

func (h *SettingsHandler) Get(c echo.Context) error {
	s, err := h.Svc.All(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, s)
}

func (h *SettingsHandler) Update(c echo.Context) error {
	var req dto.UpdateSettingsRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	s, err := h.Svc.Update(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, s)
}
