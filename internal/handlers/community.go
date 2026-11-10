package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpenses/internal/services"
)

// CommunityHandler serves Feedback & support and testimonials: the user's
// side, the public home page's list, and the administrator's review (paths
// under /admin/ are gated to admins by auth.Protect).
type CommunityHandler struct{ Svc *services.CommunityService }

func (h *CommunityHandler) Register(g *echo.Group) {
	g.GET("/feedback", h.MyFeedback)
	g.POST("/feedback", h.SendFeedback)
	g.GET("/testimonial", h.MyTestimonial)
	g.PUT("/testimonial", h.SaveTestimonial)
	g.DELETE("/testimonial", h.DeleteTestimonial)
	g.GET("/public/testimonials", h.PublicTestimonials)

	g.GET("/admin/community", h.Counts)
	g.GET("/admin/feedback", h.AdminFeedback)
	g.POST("/admin/feedback/:id/acknowledge", h.Acknowledge)
	g.POST("/admin/feedback/:id/reply", h.Reply)
	g.GET("/admin/testimonials", h.AdminTestimonials)
	g.POST("/admin/testimonials/:id/approve", h.Approve)
	g.POST("/admin/testimonials/:id/hide", h.Hide)
}

func (h *CommunityHandler) MyFeedback(c echo.Context) error {
	msgs, err := h.Svc.MyFeedback(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, map[string]any{"kinds": services.FeedbackKinds, "messages": msgs})
}

func (h *CommunityHandler) SendFeedback(c echo.Context) error {
	var req struct {
		Kind string `json:"kind"`
		Body string `json:"body"`
	}
	if err := bind(c, &req); err != nil {
		return err
	}
	f, err := h.Svc.SendFeedback(c.Request().Context(), req.Kind, req.Body)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, f)
}

func (h *CommunityHandler) MyTestimonial(c echo.Context) error {
	t, err := h.Svc.MyTestimonial(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, t)
}

func (h *CommunityHandler) SaveTestimonial(c echo.Context) error {
	var req struct {
		Body string `json:"body"`
	}
	if err := bind(c, &req); err != nil {
		return err
	}
	t, err := h.Svc.SaveTestimonial(c.Request().Context(), req.Body)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, t)
}

func (h *CommunityHandler) DeleteTestimonial(c echo.Context) error {
	if err := h.Svc.DeleteTestimonial(c.Request().Context()); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *CommunityHandler) PublicTestimonials(c echo.Context) error {
	list, err := h.Svc.PublicTestimonials(c.Request().Context())
	if err != nil {
		return err
	}
	c.Response().Header().Set("Cache-Control", "public, max-age=300")
	return JSON(c, http.StatusOK, list)
}

func (h *CommunityHandler) Counts(c echo.Context) error {
	n, err := h.Svc.Counts(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, n)
}

func (h *CommunityHandler) AdminFeedback(c echo.Context) error {
	list, err := h.Svc.AdminFeedbackList(c.Request().Context(), c.QueryParam("status"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, list)
}

func (h *CommunityHandler) Acknowledge(c echo.Context) error {
	if err := h.Svc.AcknowledgeFeedback(c.Request().Context(), c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *CommunityHandler) Reply(c echo.Context) error {
	var req struct {
		Reply string `json:"reply"`
	}
	if err := bind(c, &req); err != nil {
		return err
	}
	if err := h.Svc.ReplyToFeedback(c.Request().Context(), c.Param("id"), req.Reply); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *CommunityHandler) AdminTestimonials(c echo.Context) error {
	list, err := h.Svc.AdminTestimonials(c.Request().Context(), c.QueryParam("status"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, list)
}

func (h *CommunityHandler) Approve(c echo.Context) error {
	if err := h.Svc.ReviewTestimonial(c.Request().Context(), c.Param("id"), "approved"); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *CommunityHandler) Hide(c echo.Context) error {
	if err := h.Svc.ReviewTestimonial(c.Request().Context(), c.Param("id"), "hidden"); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
