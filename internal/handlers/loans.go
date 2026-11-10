package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpenses/internal/dto"
	"github.com/bugloper/xpenses/internal/services"
)

// LoanHandler serves loans (money lent and borrowed). Lending, borrowing and
// repaying are transactions: see POST /transactions with a loan type.
type LoanHandler struct{ Svc *services.LoanService }

func (h *LoanHandler) Register(g *echo.Group) {
	g.GET("/loans", h.List)
	g.POST("/loans", h.Create)
	g.GET("/loans/:id", h.Get)
	g.PATCH("/loans/:id", h.Update)
	g.DELETE("/loans/:id", h.Delete)
}

func (h *LoanHandler) List(c echo.Context) error {
	out, err := h.Svc.List(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

func (h *LoanHandler) Get(c echo.Context) error {
	l, err := h.Svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, l)
}

func (h *LoanHandler) Create(c echo.Context) error {
	var req dto.CreateLoanRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	l, err := h.Svc.Create(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, l)
}

func (h *LoanHandler) Update(c echo.Context) error {
	var req dto.UpdateLoanRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	l, err := h.Svc.Update(c.Request().Context(), c.Param("id"), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, l)
}

func (h *LoanHandler) Delete(c echo.Context) error {
	if err := h.Svc.Delete(c.Request().Context(), c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
