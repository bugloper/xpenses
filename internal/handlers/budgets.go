package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpensiv/internal/dto"
	"github.com/bugloper/xpensiv/internal/services"
)

type BudgetHandler struct{ Svc *services.BudgetService }

func (h *BudgetHandler) Register(g *echo.Group) {
	g.GET("/budgets", h.List)
	g.POST("/budgets", h.Create)
	g.PATCH("/budgets/:id", h.Update)
	g.DELETE("/budgets/:id", h.Delete)
}

func (h *BudgetHandler) List(c echo.Context) error {
	b, err := h.Svc.List(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, b)
}

func (h *BudgetHandler) Create(c echo.Context) error {
	var req dto.CreateBudgetRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	b, err := h.Svc.Create(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, b)
}

func (h *BudgetHandler) Update(c echo.Context) error {
	var req dto.UpdateBudgetRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	b, err := h.Svc.Update(c.Request().Context(), c.Param("id"), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, b)
}

func (h *BudgetHandler) Delete(c echo.Context) error {
	if err := h.Svc.Delete(c.Request().Context(), c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
