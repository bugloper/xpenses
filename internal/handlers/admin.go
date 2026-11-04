package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpensiv/internal/auth"
)

// AdminHandler exposes user, registration and invite management. Mount it on
// a group protected by auth.RequireAdmin.
type AdminHandler struct{ Svc *auth.Service }

func NewAdminHandler(svc *auth.Service) *AdminHandler { return &AdminHandler{Svc: svc} }

func (h *AdminHandler) Register(g *echo.Group) {
	g.GET("/admin/users", h.ListUsers)
	g.PATCH("/admin/users/:id", h.UpdateUser)
	g.DELETE("/admin/users/:id", h.DeleteUser)
	g.GET("/admin/settings", h.GetSettings)
	g.PATCH("/admin/settings", h.UpdateSettings)
	g.GET("/admin/invites", h.ListInvites)
	g.POST("/admin/invites", h.CreateInvite)
	g.DELETE("/admin/invites/:id", h.DeleteInvite)
}

func (h *AdminHandler) ListUsers(c echo.Context) error {
	users, err := h.Svc.ListUsers(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, users)
}

func (h *AdminHandler) UpdateUser(c echo.Context) error {
	var req struct {
		IsActive *bool   `json:"is_active"`
		Role     *string `json:"role"`
	}
	if err := bind(c, &req); err != nil {
		return err
	}
	u, err := h.Svc.UpdateUserAdmin(c.Request().Context(), auth.CurrentUser(c), c.Param("id"), req.IsActive, req.Role)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, u)
}

func (h *AdminHandler) DeleteUser(c echo.Context) error {
	if err := h.Svc.DeleteUser(c.Request().Context(), auth.CurrentUser(c), c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *AdminHandler) GetSettings(c echo.Context) error {
	open, err := h.Svc.RegistrationOpen(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, map[string]bool{"registration_open": open})
}

func (h *AdminHandler) UpdateSettings(c echo.Context) error {
	var req struct {
		RegistrationOpen *bool `json:"registration_open"`
	}
	if err := bind(c, &req); err != nil {
		return err
	}
	if req.RegistrationOpen != nil {
		if err := h.Svc.SetRegistrationOpen(c.Request().Context(), *req.RegistrationOpen); err != nil {
			return err
		}
	}
	return h.GetSettings(c)
}

func (h *AdminHandler) ListInvites(c echo.Context) error {
	list, err := h.Svc.ListInvites(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, list)
}

func (h *AdminHandler) CreateInvite(c echo.Context) error {
	var req struct {
		Email          string `json:"email"`
		ExpiresInHours int    `json:"expires_in_hours"`
	}
	if err := bind(c, &req); err != nil {
		return err
	}
	inv, err := h.Svc.CreateInvite(c.Request().Context(), auth.CurrentUser(c), req.Email, req.ExpiresInHours)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, inv)
}

func (h *AdminHandler) DeleteInvite(c echo.Context) error {
	if err := h.Svc.DeleteInvite(c.Request().Context(), c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
