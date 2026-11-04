// Package synth draws a payment app's success screen from scratch, so the
// OCR path can be tested with an image that carries no one's real details.
package synth

import (
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"

	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

// MBoBFields are the values printed on the synthetic mBoB screen.
type MBoBFields struct {
	Amount, JournalNo, From, To, PaymentType, Date, Time string
}

// DefaultMBoB mirrors the layout of a real "Fund Transfer Via Beneficiary
// Successful" screen with made-up numbers.
var DefaultMBoB = MBoBFields{
	Amount: "Nu. 10", JournalNo: "551-428182", From: "10XXXXX43", To: "30XXXXX34",
	PaymentType: "Personal Transfer", Date: "05 Nov 2026", Time: "01:38:10 AM",
}

// MBoB writes a PNG of the success screen, 576×1234 like a phone screenshot.
func MBoB(w io.Writer, f MBoBFields) error {
	regular, err := opentype.Parse(goregular.TTF)
	if err != nil {
		return err
	}
	bold, err := opentype.Parse(gobold.TTF)
	if err != nil {
		return err
	}
	faceBold, err := opentype.NewFace(bold, &opentype.FaceOptions{Size: 30, DPI: 72})
	if err != nil {
		return err
	}
	faceReg, err := opentype.NewFace(regular, &opentype.FaceOptions{Size: 22, DPI: 72})
	if err != nil {
		return err
	}
	faceVal, err := opentype.NewFace(bold, &opentype.FaceOptions{Size: 22, DPI: 72})
	if err != nil {
		return err
	}

	img := image.NewRGBA(image.Rect(0, 0, 576, 1234))
	draw.Draw(img, img.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	green := color.RGBA{0x3c, 0xb0, 0x43, 0xff}
	blue := color.RGBA{0x62, 0xb3, 0xe6, 0xff}
	white := color.White

	text(img, faceBold, green, 70, 400, "Fund Transfer Via Beneficiary")
	text(img, faceBold, green, 200, 440, "Successful")

	// The blue card with label : value rows.
	draw.Draw(img, image.Rect(24, 480, 552, 870), image.NewUniform(blue), image.Point{}, draw.Src)
	rows := []struct{ label, value string }{
		{"Amount", f.Amount}, {"Jrnl. No", f.JournalNo}, {"From A/c", f.From}, {"To A/c", f.To},
		{"Payment Type", f.PaymentType}, {"Date", f.Date}, {"Time", f.Time},
	}
	y := 530
	for _, r := range rows {
		text(img, faceReg, white, 56, y, r.label)
		text(img, faceReg, white, 268, y, ":")
		text(img, faceVal, white, 290, y, r.value)
		y += 50
	}
	text(img, faceReg, color.RGBA{0x33, 0x33, 0x33, 0xff}, 40, 1200, "Save")
	text(img, faceReg, color.RGBA{0x33, 0x33, 0x33, 0xff}, 470, 1200, "Share")
	return png.Encode(w, img)
}

func text(dst draw.Image, face font.Face, c color.Color, x, y int, s string) {
	d := &font.Drawer{Dst: dst, Src: image.NewUniform(c), Face: face, Dot: fixed.P(x, y)}
	d.DrawString(s)
}
