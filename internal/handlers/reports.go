package handlers

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpenses/internal/reports"
)

// ReportHandler serves the /reports/* endpoints.
type ReportHandler struct{ Svc *reports.Service }

func NewReportHandler(svc *reports.Service) *ReportHandler { return &ReportHandler{Svc: svc} }

func (h *ReportHandler) Register(g *echo.Group) {
	g.GET("/reports/summary", h.Summary)
	g.GET("/reports/categories", h.Categories)
	g.GET("/reports/cash-flow", h.CashFlow)
	g.GET("/reports/merchants", h.Merchants)
	g.GET("/reports/accounts", h.Accounts)
	g.GET("/reports/budgets", h.Budgets)
	g.GET("/reports/export", h.Export)
}

func period(c echo.Context) (reports.Period, error) {
	return reports.ParsePeriod(c.QueryParam("from"), c.QueryParam("to"), time.Now())
}

func (h *ReportHandler) Summary(c echo.Context) error {
	p, err := period(c)
	if err != nil {
		return err
	}
	out, err := h.Svc.Summary(c.Request().Context(), p)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

func (h *ReportHandler) Categories(c echo.Context) error {
	p, err := period(c)
	if err != nil {
		return err
	}
	typ, err := reports.ParseFlowType(c.QueryParam("type"))
	if err != nil {
		return err
	}
	out, err := h.Svc.Categories(c.Request().Context(), p, typ)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

func (h *ReportHandler) CashFlow(c echo.Context) error {
	p, err := period(c)
	if err != nil {
		return err
	}
	gran, err := reports.ParseGranularity(c.QueryParam("granularity"))
	if err != nil {
		return err
	}
	out, err := h.Svc.CashFlow(c.Request().Context(), p, gran)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

func (h *ReportHandler) Merchants(c echo.Context) error {
	p, err := period(c)
	if err != nil {
		return err
	}
	typ, err := reports.ParseFlowType(c.QueryParam("type"))
	if err != nil {
		return err
	}
	out, err := h.Svc.Merchants(c.Request().Context(), p, typ)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

func (h *ReportHandler) Accounts(c echo.Context) error {
	p, err := period(c)
	if err != nil {
		return err
	}
	out, err := h.Svc.Accounts(c.Request().Context(), p)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

func (h *ReportHandler) Budgets(c echo.Context) error {
	month, err := reports.ParseMonth(c.QueryParam("month"), time.Now())
	if err != nil {
		return err
	}
	out, err := h.Svc.Budgets(c.Request().Context(), month)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

// Export streams the chosen report as a CSV or PDF attachment.
func (h *ReportHandler) Export(c echo.Context) error {
	report, err := reports.ParseExportReport(c.QueryParam("report"))
	if err != nil {
		return err
	}
	format, err := reports.ParseExportFormat(c.QueryParam("format"))
	if err != nil {
		return err
	}
	req := reports.ExportRequest{Report: report, Format: format}
	if req.Period, err = period(c); err != nil {
		return err
	}
	if req.Granularity, err = reports.ParseGranularity(c.QueryParam("granularity")); err != nil {
		return err
	}
	if req.Type, err = reports.ParseFlowType(c.QueryParam("type")); err != nil {
		return err
	}
	if req.Month, err = reports.ParseMonth(c.QueryParam("month"), time.Now()); err != nil {
		return err
	}
	doc, err := h.Svc.Export(c.Request().Context(), req)
	if err != nil {
		return err
	}
	c.Response().Header().Set("Content-Disposition", reports.ContentDisposition(doc, format))
	if format == reports.FormatPDF {
		c.Response().Header().Set("Content-Type", "application/pdf")
		c.Response().WriteHeader(http.StatusOK)
		return reports.WritePDF(c.Response(), doc)
	}
	c.Response().Header().Set("Content-Type", "text/csv; charset=utf-8")
	c.Response().WriteHeader(http.StatusOK)
	return reports.WriteCSV(c.Response(), doc)
}
