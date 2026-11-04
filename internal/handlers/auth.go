package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpensiv/internal/auth"
	apperr "github.com/bugloper/xpensiv/internal/errors"
)

// AuthHandler exposes setup, registration, login and session management.
type AuthHandler struct {
	Svc *auth.Service
	MW  *auth.Middleware
}

func NewAuthHandler(svc *auth.Service, mw *auth.Middleware) *AuthHandler {
	return &AuthHandler{Svc: svc, MW: mw}
}

// RegisterPublic mounts the routes that work without a session.
func (h *AuthHandler) RegisterPublic(g *echo.Group) {
	g.GET("/auth/status", h.Status)
	g.POST("/auth/setup", h.Setup)
	g.POST("/auth/register", h.RegisterUser)
	g.POST("/auth/login", h.Login)
}

// Register mounts the authenticated routes.
func (h *AuthHandler) Register(g *echo.Group) {
	g.GET("/auth/me", h.Me)
	g.PATCH("/auth/me", h.UpdateMe)
	g.PATCH("/auth/password", h.ChangePassword)
	g.POST("/auth/logout", h.Logout)
	g.POST("/auth/logout-all", h.LogoutAll)
	g.GET("/auth/sessions", h.Sessions)
	g.DELETE("/auth/sessions/:id", h.RevokeSession)
}

type credentials struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	InviteToken string `json:"invite_token"`
}

func (h *AuthHandler) Status(c echo.Context) error {
	st, err := h.Svc.Status(c.Request().Context(), auth.CurrentUser(c) != nil)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, st)
}

func (h *AuthHandler) startSession(c echo.Context, userID string) error {
	tok, err := h.Svc.CreateSession(c.Request().Context(), userID, c.Request().UserAgent(), h.MW.ClientIP(c))
	if err != nil {
		return err
	}
	h.MW.SetCookie(c, tok)
	return nil
}

func (h *AuthHandler) Setup(c echo.Context) error {
	var req credentials
	if err := bind(c, &req); err != nil {
		return err
	}
	u, err := h.Svc.Setup(c.Request().Context(), req.Name, req.Email, req.Password)
	if err != nil {
		return err
	}
	if err := h.startSession(c, u.ID); err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, u)
}

func (h *AuthHandler) RegisterUser(c echo.Context) error {
	var req credentials
	if err := bind(c, &req); err != nil {
		return err
	}
	u, err := h.Svc.Register(c.Request().Context(), req.Name, req.Email, req.Password, req.InviteToken)
	if err != nil {
		return err
	}
	if err := h.startSession(c, u.ID); err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, u)
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req credentials
	if err := bind(c, &req); err != nil {
		return err
	}
	u, err := h.Svc.Login(c.Request().Context(), req.Email, req.Password, h.MW.ClientIP(c))
	if err != nil {
		if ae, ok := apperr.As(err); ok && ae.Code == "too_many_attempts" {
			c.Response().Header().Set("Retry-After", ae.Details["retry_after"])
		}
		return err
	}
	if err := h.startSession(c, u.ID); err != nil {
		return err
	}
	return JSON(c, http.StatusOK, u)
}

func (h *AuthHandler) Me(c echo.Context) error {
	return JSON(c, http.StatusOK, auth.CurrentUser(c))
}

func (h *AuthHandler) UpdateMe(c echo.Context) error {
	var req struct {
		Name *string `json:"name"`
	}
	if err := bind(c, &req); err != nil {
		return err
	}
	u := auth.CurrentUser(c)
	if req.Name != nil {
		var err error
		u, err = h.Svc.UpdateProfile(c.Request().Context(), u, *req.Name)
		if err != nil {
			return err
		}
	}
	return JSON(c, http.StatusOK, u)
}

func (h *AuthHandler) ChangePassword(c echo.Context) error {
	var req struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if err := bind(c, &req); err != nil {
		return err
	}
	if err := h.Svc.ChangePassword(c.Request().Context(), auth.CurrentUser(c), auth.CurrentToken(c), req.Current, req.New); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *AuthHandler) Logout(c echo.Context) error {
	if err := h.Svc.Logout(c.Request().Context(), auth.CurrentToken(c)); err != nil {
		return err
	}
	h.MW.ClearCookie(c)
	return c.NoContent(http.StatusNoContent)
}

func (h *AuthHandler) LogoutAll(c echo.Context) error {
	if err := h.Svc.LogoutAll(c.Request().Context(), auth.CurrentUser(c).ID); err != nil {
		return err
	}
	h.MW.ClearCookie(c)
	return c.NoContent(http.StatusNoContent)
}

func (h *AuthHandler) Sessions(c echo.Context) error {
	list, err := h.Svc.ListSessions(c.Request().Context(), auth.CurrentUser(c).ID, auth.CurrentToken(c))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, list)
}

func (h *AuthHandler) RevokeSession(c echo.Context) error {
	if err := h.Svc.RevokeSession(c.Request().Context(), auth.CurrentUser(c).ID, c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
