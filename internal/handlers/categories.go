package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpensiv/internal/dto"
	"github.com/bugloper/xpensiv/internal/services"
)

type CategoryHandler struct{ Svc *services.CategoryService }

func (h *CategoryHandler) Register(g *echo.Group) {
	g.GET("/categories", h.List)
	g.POST("/categories", h.Create)
	g.GET("/categories/:id", h.Get)
	g.PATCH("/categories/:id", h.Update)
}

func (h *CategoryHandler) List(c echo.Context) error {
	cats, err := h.Svc.List(c.Request().Context(), queryBool(c, "include_inactive"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, cats)
}

func (h *CategoryHandler) Get(c echo.Context) error {
	cat, err := h.Svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, cat)
}

func (h *CategoryHandler) Create(c echo.Context) error {
	var req dto.CreateCategoryRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	cat, err := h.Svc.Create(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, cat)
}

func (h *CategoryHandler) Update(c echo.Context) error {
	var req dto.UpdateCategoryRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	cat, err := h.Svc.Update(c.Request().Context(), c.Param("id"), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, cat)
}
