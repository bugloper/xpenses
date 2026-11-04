package handlers

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/labstack/echo/v4"

	apperr "github.com/bugloper/xpensiv/internal/errors"
	"github.com/bugloper/xpensiv/internal/services"
)

type BackupHandler struct {
	Svc            *services.BackupService
	MaxUploadBytes int64
}

func (h *BackupHandler) Register(g *echo.Group) {
	g.GET("/backup", h.Download)
	g.POST("/restore", h.Restore)
}

// Download creates a snapshot and streams it. Pass ?passphrase=... (or the
// X-Backup-Passphrase header) to receive an AES-256-GCM encrypted file.
func (h *BackupHandler) Download(c echo.Context) error {
	pass := c.Request().Header.Get("X-Backup-Passphrase")
	if pass == "" {
		pass = c.QueryParam("passphrase")
	}
	path, err := h.Svc.Create(c.Request().Context(), pass)
	if err != nil {
		return err
	}
	name := filepath.Base(path)
	c.Response().Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	return c.File(path)
}

// Restore accepts a multipart upload (field "file") and an optional "passphrase".
func (h *BackupHandler) Restore(c echo.Context) error {
	c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, h.MaxUploadBytes*10)
	fh, err := c.FormFile("file")
	if err != nil {
		return apperr.BadRequest("a backup file is required (multipart field 'file')")
	}
	f, err := fh.Open()
	if err != nil {
		return apperr.BadRequest("could not read uploaded file")
	}
	defer f.Close()
	if err := h.Svc.Restore(c.Request().Context(), f, c.FormValue("passphrase")); err != nil {
		return err
	}
	return JSON(c, http.StatusOK, map[string]string{"status": "restored"})
}

// ensureDir is a small helper used by main to create directories with 0700.
func EnsureDir(p string) error { return os.MkdirAll(p, 0o700) }
