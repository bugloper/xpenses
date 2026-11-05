package handlers

import (
	"encoding/csv"
	"net/http"
	"os"
	"strconv"

	"github.com/labstack/echo/v4"

	"github.com/bugloper/xpenses/internal/dto"
	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
	"github.com/bugloper/xpenses/internal/services"
)

type TransactionHandler struct{ Svc *services.TransactionService }

func (h *TransactionHandler) Register(g *echo.Group) {
	g.GET("/transactions", h.List)
	g.GET("/transactions/export.csv", h.ExportCSV)
	g.POST("/transactions", h.Create)
	g.GET("/transactions/:id", h.Get)
	g.PATCH("/transactions/:id", h.Update)
	g.DELETE("/transactions/:id", h.Delete)
	g.POST("/transactions/:id/duplicate", h.Duplicate)
	g.POST("/transactions/:id/attachment", h.Attach)
	g.PUT("/transactions/:id/attachment", h.Attach)
	g.GET("/transactions/:id/attachment", h.Attachment)
	g.DELETE("/transactions/:id/attachment", h.DetachFile)
	g.POST("/transactions/:id/attachment/scan", h.ScanAttachment)
	g.POST("/receipts/scan", h.ScanReceipt)
	g.GET("/receipts/capabilities", h.ReceiptCapabilities)
}

// ReceiptCapabilities tells the app whether this server can read screenshots.
func (h *TransactionHandler) ReceiptCapabilities(c echo.Context) error {
	return JSON(c, http.StatusOK, map[string]any{"ocr": h.Svc.OCRAvailable(), "banks": []string{"mBoB", "mPay"}})
}

// ScanReceipt reads an uploaded screenshot (multipart "file") and returns what
// it says, without storing anything. The add screen uses it to prefill.
func (h *TransactionHandler) ScanReceipt(c echo.Context) error {
	fh, err := c.FormFile("file")
	if err != nil {
		return apperr.BadRequest("an image is required (multipart field 'file')")
	}
	f, err := fh.Open()
	if err != nil {
		return apperr.BadRequest("could not read the uploaded file")
	}
	defer f.Close()
	r, err := h.Svc.ScanImage(c.Request().Context(), f)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, r)
}

// ScanAttachment re-reads the stored screenshot and saves its details.
func (h *TransactionHandler) ScanAttachment(c echo.Context) error {
	r, err := h.Svc.ScanAttachment(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, r)
}

// Attach stores an image (multipart field "file") on the transaction.
func (h *TransactionHandler) Attach(c echo.Context) error {
	fh, err := c.FormFile("file")
	if err != nil {
		return apperr.BadRequest("an image is required (multipart field 'file')")
	}
	f, err := fh.Open()
	if err != nil {
		return apperr.BadRequest("could not read the uploaded file")
	}
	defer f.Close()
	if err := h.Svc.AttachFile(c.Request().Context(), c.Param("id"), f); err != nil {
		return err
	}
	t, err := h.Svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, t)
}

// Attachment serves the stored image to its owner.
func (h *TransactionHandler) Attachment(c echo.Context) error {
	path, mime, err := h.Svc.Attachment(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	f, err := os.Open(path)
	if err != nil {
		return apperr.NotFound("attachment")
	}
	defer f.Close()
	c.Response().Header().Set("Cache-Control", "private, max-age=3600")
	c.Response().Header().Set("X-Content-Type-Options", "nosniff")
	return c.Stream(http.StatusOK, mime, f)
}

func (h *TransactionHandler) DetachFile(c echo.Context) error {
	if err := h.Svc.RemoveAttachment(c.Request().Context(), c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func filterFromQuery(c echo.Context) dto.TransactionFilter {
	return dto.TransactionFilter{
		Search:     c.QueryParam("search"),
		DateFrom:   c.QueryParam("date_from"),
		DateTo:     c.QueryParam("date_to"),
		CategoryID: c.QueryParam("category_id"),
		AccountID:  c.QueryParam("account_id"),
		Type:       c.QueryParam("type"),
		Status:     c.QueryParam("status"),
		Origin:     c.QueryParam("origin"),
		Unmatched:  queryBool(c, "unmatched"),
		Sort:       c.QueryParam("sort"),
		Order:      c.QueryParam("order"),
		Page:       queryInt(c, "page", 1),
		PerPage:    queryInt(c, "per_page", 50),
	}
}

func (h *TransactionHandler) List(c echo.Context) error {
	f := filterFromQuery(c)
	txs, total, err := h.Svc.List(c.Request().Context(), f)
	if err != nil {
		return err
	}
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PerPage < 1 || f.PerPage > 200 {
		f.PerPage = 50
	}
	return c.JSON(http.StatusOK, dto.Page[models.Transaction]{Data: txs, Meta: dto.Pagination{Page: f.Page, PerPage: f.PerPage, Total: total}})
}

// ExportCSV streams every transaction matching the filter as CSV.
func (h *TransactionHandler) ExportCSV(c echo.Context) error {
	f := filterFromQuery(c)
	f.Page = 1
	f.PerPage = 200
	c.Response().Header().Set("Content-Type", "text/csv; charset=utf-8")
	c.Response().Header().Set("Content-Disposition", `attachment; filename="transactions.csv"`)
	c.Response().WriteHeader(http.StatusOK)
	w := csv.NewWriter(c.Response())
	_ = w.Write([]string{"date", "type", "amount", "currency", "account", "transfer_account", "category", "payee", "description", "notes", "status", "origin", "tags", "id"})
	for {
		txs, total, err := h.Svc.List(c.Request().Context(), f)
		if err != nil {
			return err
		}
		for _, t := range txs {
			_ = w.Write([]string{t.TransactionDate, t.Type, formatMinor(t.Amount), t.Currency, t.AccountName, t.TransferAccountName,
				t.CategoryName, t.Payee, t.Description, t.Notes, t.Status, t.Origin, joinTags(t.Tags), t.ID})
		}
		if f.Page*f.PerPage >= total || len(txs) == 0 {
			break
		}
		f.Page++
	}
	w.Flush()
	return w.Error()
}

func formatMinor(v int64) string {
	neg := v < 0
	if neg {
		v = -v
	}
	s := strconv.FormatInt(v/100, 10) + "." + pad2(v%100)
	if neg {
		return "-" + s
	}
	return s
}

func pad2(v int64) string {
	if v < 10 {
		return "0" + strconv.FormatInt(v, 10)
	}
	return strconv.FormatInt(v, 10)
}

func joinTags(tags []string) string {
	out := ""
	for i, t := range tags {
		if i > 0 {
			out += "|"
		}
		out += t
	}
	return out
}

func (h *TransactionHandler) Get(c echo.Context) error {
	t, err := h.Svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, t)
}

func (h *TransactionHandler) Create(c echo.Context) error {
	var req dto.CreateTransactionRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	t, created, err := h.Svc.Create(c.Request().Context(), req)
	if err != nil {
		return err
	}
	if !created {
		return JSON(c, http.StatusOK, t)
	}
	return JSON(c, http.StatusCreated, t)
}

func (h *TransactionHandler) Update(c echo.Context) error {
	var req dto.UpdateTransactionRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	t, err := h.Svc.Update(c.Request().Context(), c.Param("id"), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, t)
}

func (h *TransactionHandler) Delete(c echo.Context) error {
	if err := h.Svc.Delete(c.Request().Context(), c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *TransactionHandler) Duplicate(c echo.Context) error {
	var body struct {
		TransactionDate string `json:"transaction_date"`
	}
	_ = c.Bind(&body)
	t, err := h.Svc.Duplicate(c.Request().Context(), c.Param("id"), body.TransactionDate)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, t)
}
