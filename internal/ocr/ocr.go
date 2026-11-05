// Package ocr reads text out of an image by running the Tesseract command
// line tool. Tesseract is a system package (the Docker image installs it);
// when it is missing, Available() is false and Extract returns ErrUnavailable
// so the rest of the app simply skips reading screenshots.
package ocr

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	_ "image/jpeg" // decoders for the attachment types
	_ "image/png"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

var ErrUnavailable = errors.New("ocr: tesseract is not installed")

// Engine shells out to tesseract. Binary is the command name or path.
type Engine struct {
	Binary  string
	Timeout time.Duration
}

func New(binary string) *Engine {
	if binary == "" {
		binary = "tesseract"
	}
	return &Engine{Binary: binary, Timeout: 30 * time.Second}
}

// Available reports whether the tesseract binary can be found.
func (e *Engine) Available() bool {
	_, err := exec.LookPath(e.Binary)
	return err == nil
}

// Extract returns the text Tesseract reads in the image at path. Screens with
// light text on a dark background are handled by trying the inverted image
// too and keeping whichever read yields more text.
func (e *Engine) Extract(ctx context.Context, path string) (string, error) {
	if !e.Available() {
		return "", ErrUnavailable
	}
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	img, _, err := image.Decode(f)
	f.Close()
	if err != nil {
		return "", fmt.Errorf("ocr: decode image: %w", err)
	}
	prepared := prepare(img)
	dir, err := os.MkdirTemp("", "xpenses-ocr-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)

	best := ""
	for i, variant := range []*image.Gray{prepared, invert(prepared)} {
		p := filepath.Join(dir, fmt.Sprintf("v%d.png", i))
		if err := writePNG(p, variant); err != nil {
			return "", err
		}
		text, err := e.run(ctx, p)
		if err != nil {
			return "", err
		}
		if len(text) > len(best) {
			best = text
		}
	}
	return best, nil
}

func (e *Engine) run(ctx context.Context, path string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, e.Timeout)
	defer cancel()
	// psm 6: a single uniform block of text, right for a receipt-like screen.
	cmd := exec.CommandContext(ctx, e.Binary, path, "stdout", "--psm", "6", "-l", "eng")
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("ocr: tesseract: %w: %s", err, bytes.TrimSpace(stderr.Bytes()))
	}
	return out.String(), nil
}

// prepare converts to greyscale and upscales small images: Tesseract reads
// phone screenshots far better at ~2× their native size.
func prepare(img image.Image) *image.Gray {
	b := img.Bounds()
	scale := 1
	if b.Dx() < 1200 {
		scale = 2
	}
	dst := image.NewGray(image.Rect(0, 0, b.Dx()*scale, b.Dy()*scale))
	if scale == 1 {
		draw.Draw(dst, dst.Bounds(), img, b.Min, draw.Src)
	} else {
		xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Src, nil)
	}
	return dst
}

func invert(src *image.Gray) *image.Gray {
	dst := image.NewGray(src.Bounds())
	for i, v := range src.Pix {
		dst.Pix[i] = 255 - v
	}
	return dst
}

func writePNG(path string, img image.Image) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, img)
}
