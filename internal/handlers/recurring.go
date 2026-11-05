package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpenses/internal/dto"
	"github.com/bugloper/xpenses/internal/services"
)

type RecurringHandler struct{ Svc *services.RecurringService }

func (h *RecurringHandler) Register(g *echo.Group) {
	g.GET("/recurring", h.List)
	g.POST("/recurring", h.Create)
	g.POST("/recurring/run", h.Run)
	g.GET("/recurring/:id", h.Get)
	g.PATCH("/recurring/:id", h.Update)
	g.DELETE("/recurring/:id", h.Delete)
}

func (h *RecurringHandler) List(c echo.Context) error {
	r, err := h.Svc.List(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, r)
}

func (h *RecurringHandler) Get(c echo.Context) error {
	r, err := h.Svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, r)
}

func (h *RecurringHandler) Create(c echo.Context) error {
	var req dto.CreateRecurringRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	r, err := h.Svc.Create(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, r)
}

func (h *RecurringHandler) Update(c echo.Context) error {
	var req dto.UpdateRecurringRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	r, err := h.Svc.Update(c.Request().Context(), c.Param("id"), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, r)
}

func (h *RecurringHandler) Delete(c echo.Context) error {
	if err := h.Svc.Delete(c.Request().Context(), c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *RecurringHandler) Run(c echo.Context) error {
	res, err := h.Svc.Generate(c.Request().Context(), c.QueryParam("as_of"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, res)
}
