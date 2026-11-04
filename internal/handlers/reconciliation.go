package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpensiv/internal/reconciliation"
)

type ReconciliationHandler struct{ Svc *reconciliation.Service }

func NewReconciliationHandler(svc *reconciliation.Service) *ReconciliationHandler {
	return &ReconciliationHandler{Svc: svc}
}

func (h *ReconciliationHandler) Register(g *echo.Group) {
	g.GET("/reconciliation", h.Overview)
	g.GET("/reconciliation/:statement_id", h.Workspace)
	g.POST("/reconciliation/auto-match", h.AutoMatch)
	g.POST("/reconciliation/match", h.Match)
	g.POST("/reconciliation/unmatch", h.Unmatch)
	g.POST("/reconciliation/ignore", h.Ignore)
	g.POST("/reconciliation/transfer", h.Transfer)
	g.POST("/reconciliation/create-transaction", h.CreateTransaction)
	g.POST("/reconciliation/adjustment", h.Adjustment)
}

func (h *ReconciliationHandler) Overview(c echo.Context) error {
	out, err := h.Svc.Overview(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

func (h *ReconciliationHandler) Workspace(c echo.Context) error {
	out, err := h.Svc.Workspace(c.Request().Context(), c.Param("statement_id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

func (h *ReconciliationHandler) AutoMatch(c echo.Context) error {
	var req reconciliation.AutoMatchRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	n, err := h.Svc.AutoMatch(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, map[string]int{"matched": n})
}

func (h *ReconciliationHandler) Match(c echo.Context) error {
	var req reconciliation.MatchRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	out, err := h.Svc.Match(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, out)
}

func (h *ReconciliationHandler) Unmatch(c echo.Context) error {
	var req reconciliation.BankLineRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	if err := h.Svc.Unmatch(c.Request().Context(), req); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *ReconciliationHandler) Ignore(c echo.Context) error {
	var req reconciliation.BankLineRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	out, err := h.Svc.Ignore(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, out)
}

func (h *ReconciliationHandler) Transfer(c echo.Context) error {
	var req reconciliation.TransferRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	out, err := h.Svc.MarkTransfer(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, out)
}

func (h *ReconciliationHandler) CreateTransaction(c echo.Context) error {
	var req reconciliation.CreateTransactionRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	out, err := h.Svc.CreateTransaction(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, out)
}

func (h *ReconciliationHandler) Adjustment(c echo.Context) error {
	var req reconciliation.MatchRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	out, err := h.Svc.Adjustment(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, out)
}
