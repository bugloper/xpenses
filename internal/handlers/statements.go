package handlers

import (
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"

	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/services"
)

// StatementHandler serves the bank statement import endpoints.
type StatementHandler struct {
	Svc       *services.StatementService
	MaxUpload int64
}

// NewStatementHandler builds the handler; maxUpload caps the PDF size in bytes.
func NewStatementHandler(svc *services.StatementService, maxUpload int64) *StatementHandler {
	return &StatementHandler{Svc: svc, MaxUpload: maxUpload}
}

func (h *StatementHandler) Register(g *echo.Group) {
	g.POST("/statements/parse", h.Parse)
	g.POST("/statements/import", h.Import)
	g.GET("/statements", h.List)
	g.GET("/statements/:id", h.Get)
	g.GET("/statements/:id/transactions", h.Transactions)
	g.GET("/statements/:id/file", h.File)
	g.DELETE("/statements/:id", h.Delete)
}

func invalidFile(msg string) *apperr.Error {
	return &apperr.Error{Status: http.StatusBadRequest, Code: "invalid_file", Message: msg}
}

// Parse accepts multipart `file`, `account_id`, `password?`, `provider?` and
// returns an ImportPreview. Nothing is persisted.
func (h *StatementHandler) Parse(c echo.Context) error {
	// Allow some slack for the other multipart fields; the file itself is
	// checked against MaxUpload below.
	limit := h.MaxUpload + (64 << 10)
	if c.Request().ContentLength > limit {
		return apperr.PayloadTooLarge("the PDF exceeds the upload limit")
	}
	c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, limit)
	fh, err := c.FormFile("file")
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return apperr.PayloadTooLarge("the PDF exceeds the upload limit")
		}
		return invalidFile("a PDF file is required (multipart field 'file')")
	}
	if fh.Size > h.MaxUpload {
		return apperr.PayloadTooLarge("the PDF exceeds the upload limit")
	}
	if ct := fh.Header.Get("Content-Type"); ct != "" && !strings.Contains(ct, "pdf") && !strings.Contains(ct, "octet-stream") {
		return invalidFile("the uploaded file must be a PDF")
	}
	f, err := fh.Open()
	if err != nil {
		return invalidFile("could not read the uploaded file")
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, h.MaxUpload+1))
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return apperr.PayloadTooLarge("the PDF exceeds the upload limit")
		}
		return invalidFile("could not read the uploaded file")
	}
	if int64(len(data)) > h.MaxUpload {
		return apperr.PayloadTooLarge("the PDF exceeds the upload limit")
	}
	preview, err := h.Svc.Parse(c.Request().Context(), services.ParseInput{
		AccountID: c.FormValue("account_id"),
		Provider:  c.FormValue("provider"),
		Password:  c.FormValue("password"),
		FileName:  filepath.Base(fh.Filename),
		Data:      data,
	})
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, preview)
}

func (h *StatementHandler) Import(c echo.Context) error {
	var req services.ImportRequest
	if err := bind(c, &req); err != nil {
		return err
	}
	st, err := h.Svc.Import(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return JSON(c, http.StatusCreated, st)
}

func (h *StatementHandler) List(c echo.Context) error {
	out, err := h.Svc.List(c.Request().Context())
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

func (h *StatementHandler) Get(c echo.Context) error {
	st, err := h.Svc.Get(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, st)
}

func (h *StatementHandler) Transactions(c echo.Context) error {
	out, err := h.Svc.Transactions(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	return JSON(c, http.StatusOK, out)
}

// File streams the original PDF for auditing.
func (h *StatementHandler) File(c echo.Context) error {
	path, name, err := h.Svc.FilePath(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	c.Response().Header().Set("Content-Type", "application/pdf")
	c.Response().Header().Set("Content-Disposition", `inline; filename="`+strings.ReplaceAll(name, `"`, "")+`"`)
	c.Response().Header().Set("Cache-Control", "private, no-store")
	return c.File(path)
}

func (h *StatementHandler) Delete(c echo.Context) error {
	if err := h.Svc.Delete(c.Request().Context(), c.Param("id")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
