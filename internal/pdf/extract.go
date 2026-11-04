package pdf

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"os/exec"
	"sort"
	"strings"
	"unicode/utf8"

	ltpdf "github.com/ledongthuc/pdf"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// Extract reads a PDF (optionally encrypted with password) and returns its
// text as positioned rows plus layout lines.
//
// Pipeline:
//  1. header check (%PDF-) -> ErrNotPDF
//  2. pdfcpu decrypts RC4/AES-128/AES-256 files into memory (ErrPasswordRequired /
//     ErrPasswordIncorrect). Unencrypted files pass through untouched.
//  3. ledongthuc/pdf walks every page's content stream and yields glyphs with
//     X/Y positions, which are grouped into rows and fragments here.
//  4. If the Go path produces nothing and a `pdftotext` binary is on PATH it is
//     used as a last resort (layout text only, X = character column).
//  5. No text at all -> ErrNoText.
//
// OCR hook: scanned statements (image-only pages) end here with ErrNoText. A
// future OCR implementation should plug in before step 5: render each page,
// run OCR, and build Pages whose Rows carry the recognised words with their
// bounding-box X so the header-driven parsers keep working unchanged.
func Extract(r io.ReaderAt, size int64, password string) (*Document, error) {
	if size <= 0 {
		return nil, ErrNotPDF
	}
	data := make([]byte, size)
	if _, err := r.ReadAt(data, 0); err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("pdf: read: %w", err)
	}
	if !IsPDF(data) {
		return nil, ErrNotPDF
	}

	plain, err := decrypt(data, password)
	if err != nil {
		if errors.Is(err, ErrPasswordRequired) || errors.Is(err, ErrPasswordIncorrect) {
			return nil, err
		}
		// pdfcpu could not read the file at all; pdftotext (if installed) gets
		// one shot at it with the password before we give up.
		if fb, ferr := extractPdftotextPW(data, password); ferr == nil && fb.HasText() {
			return fb, nil
		}
		return nil, err
	}

	doc, goErr := extractGo(plain)
	if goErr == nil && doc.HasText() {
		return doc, nil
	}
	if fb, err := extractPdftotext(plain); err == nil && fb.HasText() {
		return fb, nil
	}
	if goErr != nil {
		return nil, fmt.Errorf("pdf: extract text: %w", goErr)
	}
	return nil, ErrNoText
}

// IsPDF reports whether data starts with a PDF header (within the first 1 KiB,
// as permitted by the spec).
func IsPDF(data []byte) bool {
	head := data
	if len(head) > 1024 {
		head = head[:1024]
	}
	return bytes.Contains(head, []byte("%PDF-"))
}

// decrypt returns the decrypted bytes of data, or data itself when it is not
// encrypted.
func decrypt(data []byte, password string) ([]byte, error) {
	conf, err := api.LoadConfiguration(api.ConfigurationOptions{Mode: api.ConfigurationModeStateless})
	if err != nil {
		return nil, fmt.Errorf("pdf: pdfcpu config: %w", err)
	}
	conf.UserPW = password
	conf.OwnerPW = password
	conf.ValidationMode = model.ValidationRelaxed
	var out bytes.Buffer
	err = api.Decrypt(context.Background(), bytes.NewReader(data), &out, conf)
	switch {
	case err == nil:
		return out.Bytes(), nil
	case errors.Is(err, pdfcpu.ErrNotEncrypted):
		return data, nil
	case errors.Is(err, pdfcpu.ErrWrongPassword):
		if password == "" {
			return nil, ErrPasswordRequired
		}
		return nil, ErrPasswordIncorrect
	default:
		return nil, fmt.Errorf("pdf: open: %w", err)
	}
}

func extractGo(data []byte) (doc *Document, err error) {
	defer func() {
		if p := recover(); p != nil {
			doc, err = nil, fmt.Errorf("malformed PDF: %v", p)
		}
	}()
	rd, err := ltpdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	doc = &Document{Positioned: true, Source: "go"}
	n := rd.NumPage()
	for i := 1; i <= n; i++ {
		page := extractPage(rd.Page(i), i)
		doc.Pages = append(doc.Pages, page)
	}
	return doc, nil
}

func extractPage(p ltpdf.Page, num int) (page Page) {
	page = Page{Number: num}
	defer func() {
		if r := recover(); r != nil {
			// Keep whatever was extracted for the other pages.
			page.Rows, page.Lines = nil, nil
		}
	}()
	if p.V.IsNull() {
		return page
	}
	// MediaBox may be inherited from an ancestor Pages node.
	for v := p.V; !v.IsNull(); v = v.Key("Parent") {
		if mb := v.Key("MediaBox"); mb.Len() == 4 {
			page.Width = mb.Index(2).Float64() - mb.Index(0).Float64()
			page.Height = mb.Index(3).Float64() - mb.Index(1).Float64()
			break
		}
	}
	texts := p.Content().Text
	page.Rows = groupRows(texts)
	page.Lines = layoutLines(page.Rows, texts)
	return page
}

// groupRows clusters glyphs by baseline (Y) and merges neighbouring glyphs
// into fragments. A new fragment starts where the horizontal gap exceeds ~0.9
// em; smaller gaps that are wider than a thin space become a space character.
func groupRows(texts []ltpdf.Text) []Row {
	glyphs := make([]ltpdf.Text, 0, len(texts))
	for _, t := range texts {
		if t.S == "" || t.S == "\n" || t.S == "\r" {
			continue
		}
		glyphs = append(glyphs, t)
	}
	if len(glyphs) == 0 {
		return nil
	}
	sort.SliceStable(glyphs, func(i, j int) bool {
		if glyphs[i].Y != glyphs[j].Y {
			return glyphs[i].Y > glyphs[j].Y
		}
		return glyphs[i].X < glyphs[j].X
	})

	// Cluster by Y.
	type cluster struct {
		y      float64
		glyphs []ltpdf.Text
	}
	var clusters []*cluster
	for _, g := range glyphs {
		tol := math.Max(2.0, g.FontSize*0.35)
		if len(clusters) > 0 && math.Abs(clusters[len(clusters)-1].y-g.Y) <= tol {
			c := clusters[len(clusters)-1]
			c.glyphs = append(c.glyphs, g)
			continue
		}
		clusters = append(clusters, &cluster{y: g.Y, glyphs: []ltpdf.Text{g}})
	}

	rows := make([]Row, 0, len(clusters))
	for _, c := range clusters {
		gl := c.glyphs
		sort.SliceStable(gl, func(i, j int) bool { return gl[i].X < gl[j].X })
		row := Row{Y: c.y}
		var cur *Fragment
		var sb strings.Builder
		var prevRight, prevSize float64
		flush := func() {
			if cur != nil {
				cur.Text = sb.String()
				if strings.TrimSpace(cur.Text) != "" {
					cur.W = prevRight - cur.X
					row.Fragments = append(row.Fragments, *cur)
				}
				cur = nil
				sb.Reset()
			}
		}
		var prevX float64
		for _, g := range gl {
			size := g.FontSize
			if size <= 0 {
				size = 10
			}
			x, w := g.X, g.W
			if w <= 0 {
				// Fonts without a /Widths array (standard-14 core fonts) leave
				// every glyph of a run at the same X. Estimate the advance so
				// fragments keep a plausible extent.
				w = estimateWidth(g.S, size)
				if cur != nil && x == prevX {
					x = prevRight
				}
			}
			gap := x - prevRight
			if cur == nil || gap > 0.9*math.Max(size, prevSize) {
				flush()
				cur = &Fragment{X: x, Y: g.Y}
			} else if gap > 0.18*math.Max(size, prevSize) && !strings.HasSuffix(sb.String(), " ") && g.S != " " {
				sb.WriteByte(' ')
			}
			sb.WriteString(g.S)
			prevRight = x + w
			prevSize = size
			prevX = g.X
		}
		flush()
		for i := range row.Fragments {
			row.Fragments[i].Text = strings.TrimSpace(row.Fragments[i].Text)
		}
		if len(row.Fragments) > 0 {
			rows = append(rows, row)
		}
	}
	return rows
}

// estimateWidth approximates a Helvetica-like advance for glyphs whose font
// carries no width table.
func estimateWidth(s string, size float64) float64 {
	var em float64
	for _, r := range s {
		switch {
		case r == ' ' || r == '.' || r == ',' || r == ':' || r == '\'' || r == 'i' || r == 'l' || r == 'j' || r == 'I' || r == '|':
			em += 0.28
		case r == 'm' || r == 'w' || r == 'M' || r == 'W':
			em += 0.85
		case r >= 'A' && r <= 'Z':
			em += 0.68
		case r >= '0' && r <= '9':
			em += 0.556
		case r >= 'a' && r <= 'z':
			em += 0.52
		default:
			em += 0.5
		}
	}
	return em * size
}

// layoutLines renders rows as fixed-pitch text, placing each fragment at the
// column proportional to its X. This mirrors `pdftotext -layout` closely
// enough for regex-based fallbacks and for human-readable fixtures.
func layoutLines(rows []Row, texts []ltpdf.Text) []string {
	var sumW float64
	var n int
	for _, t := range texts {
		if t.S == " " {
			continue
		}
		w := t.W
		if w <= 0 {
			w = estimateWidth(t.S, t.FontSize)
		}
		if w > 0 {
			sumW += w
			n++
		}
	}
	cw := 5.0
	if n > 0 {
		cw = sumW / float64(n)
	}
	if cw < 1 {
		cw = 1
	}
	lines := make([]string, 0, len(rows))
	for _, r := range rows {
		var sb strings.Builder
		col := 0
		for _, f := range r.Fragments {
			want := int(math.Round(f.X / cw))
			if want <= col && sb.Len() > 0 {
				want = col + 1
			}
			for col < want {
				sb.WriteByte(' ')
				col++
			}
			sb.WriteString(f.Text)
			col += utf8.RuneCountInString(f.Text)
		}
		lines = append(lines, strings.TrimRight(sb.String(), " "))
	}
	return lines
}

// DocumentFromLines builds a Document from layout text (one slice of lines per
// page). Fragments are split at runs of two or more spaces; X is the
// character column. Used by the pdftotext fallback and by tests.
func DocumentFromLines(pages [][]string, source string) *Document {
	doc := &Document{Positioned: false, Source: source}
	for i, lines := range pages {
		page := Page{Number: i + 1, Lines: lines}
		for li, line := range lines {
			row := Row{Y: float64(len(lines) - li)}
			for _, part := range splitLayout(line) {
				row.Fragments = append(row.Fragments, Fragment{X: float64(part.start), Y: row.Y, W: float64(utf8.RuneCountInString(part.text)), Text: part.text})
			}
			if len(row.Fragments) > 0 {
				page.Rows = append(page.Rows, row)
			}
		}
		doc.Pages = append(doc.Pages, page)
	}
	return doc
}

type layoutPart struct {
	start int
	text  string
}

// splitLayout splits a line at gaps of 2+ spaces, returning each part with its
// starting rune column.
func splitLayout(line string) []layoutPart {
	var parts []layoutPart
	runes := []rune(line)
	i := 0
	for i < len(runes) {
		for i < len(runes) && runes[i] == ' ' {
			i++
		}
		if i >= len(runes) {
			break
		}
		start := i
		for i < len(runes) {
			if runes[i] == ' ' && i+1 < len(runes) && runes[i+1] == ' ' {
				break
			}
			if runes[i] == ' ' && i+1 >= len(runes) {
				break
			}
			i++
		}
		parts = append(parts, layoutPart{start: start, text: strings.TrimSpace(string(runes[start:i]))})
	}
	return parts
}

// extractPdftotext shells out to pdftotext when available. Tests never rely on it.
func extractPdftotext(data []byte) (*Document, error) {
	return extractPdftotextPW(data, "")
}

func extractPdftotextPW(data []byte, password string) (*Document, error) {
	bin, err := exec.LookPath("pdftotext")
	if err != nil {
		return nil, err
	}
	args := []string{"-layout"}
	if password != "" {
		args = append(args, "-upw", password)
	}
	args = append(args, "-", "-")
	cmd := exec.Command(bin, args...)
	cmd.Stdin = bytes.NewReader(data)
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("pdftotext: %w", err)
	}
	var pages [][]string
	for _, chunk := range strings.Split(out.String(), "\f") {
		lines := strings.Split(strings.TrimRight(chunk, "\n"), "\n")
		if len(lines) == 1 && strings.TrimSpace(lines[0]) == "" {
			continue
		}
		pages = append(pages, lines)
	}
	return DocumentFromLines(pages, "pdftotext"), nil
}
