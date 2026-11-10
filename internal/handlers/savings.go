package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpenses/internal/dto"
	"github.com/bugloper/xpenses/internal/services"
)

// SavingsHandler serves savings goals and their contributions.
type SavingsHandler struct{ Svc *services.SavingsService }

func (h *SavingsHandler) Register(g *echo.Group) {
	g.GET("/savings-goals", h.List)
	g.POST("/savings-goals", h.Create)
	g.GET("/savings-goals/:id", h.Get)
	g.PATCH("/savings-goals/:id", h.Update)
	g.DELETE("/savings-goals/:id", h.Delete)
	g.POST("/savings-goals/:id/entries", h.AddEntry)
	g.DELETE("/savings-goals/:id/entries/:entry", h.DeleteEntry)
}

func (h *SavingsHandler) List(c echo.Context) error {
	out, err := h.Svc.List(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

func (h *SavingsHandler) Get(c echo.Context) error {
	g, err := h.Svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, g)
}

func (h *SavingsHandler) Create(c echo.Context) error {
	var req dto.CreateSavingsGoalRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	g, err := h.Svc.Create(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, g)
}

func (h *SavingsHandler) Update(c echo.Context) error {
	var req dto.UpdateSavingsGoalRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	g, err := h.Svc.Update(c.Request().Context(), c.Param("id"), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, g)
}

func (h *SavingsHandler) Delete(c echo.Context) error {
	if err := h.Svc.Delete(c.Request().Context(), c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *SavingsHandler) AddEntry(c echo.Context) error {
	var req dto.SavingsGoalEntryRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	g, err := h.Svc.AddEntry(c.Request().Context(), c.Param("id"), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, g)
}

func (h *SavingsHandler) DeleteEntry(c echo.Context) error {
	g, err := h.Svc.DeleteEntry(c.Request().Context(), c.Param("id"), c.Param("entry"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, g)
}
