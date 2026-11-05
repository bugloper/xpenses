package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpenses/internal/dto"
	"github.com/bugloper/xpenses/internal/services"
)

type AccountHandler struct{ Svc *services.AccountService }

func (h *AccountHandler) Register(g *echo.Group) {
	g.GET("/accounts", h.List)
	g.POST("/accounts", h.Create)
	g.GET("/accounts/:id", h.Get)
	g.PATCH("/accounts/:id", h.Update)
}

func (h *AccountHandler) List(c echo.Context) error {
	accts, err := h.Svc.List(c.Request().Context(), queryBool(c, "include_inactive"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, accts)
}

func (h *AccountHandler) Get(c echo.Context) error {
	a, err := h.Svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, a)
}

func (h *AccountHandler) Create(c echo.Context) error {
	var req dto.CreateAccountRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	a, err := h.Svc.Create(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, a)
}

func (h *AccountHandler) Update(c echo.Context) error {
	var req dto.UpdateAccountRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	a, err := h.Svc.Update(c.Request().Context(), c.Param("id"), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, a)
}
