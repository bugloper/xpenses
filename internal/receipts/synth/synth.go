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

// MPayFields are the values printed on the synthetic mPay screen.
type MPayFields struct {
	Amount, RRNO, FromName, FromAccount, ToName, ToAccount, Date, Time, Purpose string
}

// DefaultMPay mirrors the layout of a real mPay "TRANSACTION SUCCESSFUL"
// screen with made-up numbers.
var DefaultMPay = MPayFields{
	Amount: "Nu.10.0", RRNO: "630911234567", FromName: "SENDER NAME", FromAccount: "XXXXX1234",
	ToName: "RECEIVER NAME", ToAccount: "XXXXX5678", Date: "Thursday, 05 November 2026",
	Time: "10:59:20 AM", Purpose: "Personal transfer",
}

// MPay writes a PNG of the success screen: white text on the app's dark
// navy background, with the sender and receiver side by side.
func MPay(w io.Writer, f MPayFields) error {
	regular, err := opentype.Parse(goregular.TTF)
	if err != nil {
		return err
	}
	bold, err := opentype.Parse(gobold.TTF)
	if err != nil {
		return err
	}
	faceTitle, err := opentype.NewFace(regular, &opentype.FaceOptions{Size: 30, DPI: 72})
	if err != nil {
		return err
	}
	faceAmount, err := opentype.NewFace(regular, &opentype.FaceOptions{Size: 44, DPI: 72})
	if err != nil {
		return err
	}
	faceLabel, err := opentype.NewFace(bold, &opentype.FaceOptions{Size: 24, DPI: 72})
	if err != nil {
		return err
	}
	faceVal, err := opentype.NewFace(regular, &opentype.FaceOptions{Size: 24, DPI: 72})
	if err != nil {
		return err
	}

	img := image.NewRGBA(image.Rect(0, 0, 704, 1380))
	navy := color.RGBA{0x1c, 0x1d, 0x30, 0xff}
	white := color.White
	draw.Draw(img, img.Bounds(), image.NewUniform(navy), image.Point{}, draw.Src)

	// The white pill with the title.
	draw.Draw(img, image.Rect(60, 520, 644, 630), image.NewUniform(white), image.Point{}, draw.Src)
	text(img, faceTitle, navy, 125, 588, "TRANSACTION SUCCESSFUL")

	text(img, faceAmount, white, 270, 725, f.Amount)
	text(img, faceLabel, white, 105, 800, "RRNO :")
	text(img, faceVal, white, 215, 800, f.RRNO)

	text(img, faceLabel, white, 105, 865, "From :")
	text(img, faceVal, white, 105, 900, f.FromName)
	text(img, faceVal, white, 105, 935, f.FromAccount)
	text(img, faceLabel, white, 365, 865, "To :")
	text(img, faceVal, white, 365, 900, f.ToAccount)
	text(img, faceVal, white, 365, 935, f.ToName)
	text(img, faceVal, white, 365, 970, "Bank of Bhutan Ltd.")

	rows := []struct{ label, value string }{
		{"Date :", f.Date}, {"Time :", f.Time}, {"Purpose :", f.Purpose}, {"Remarks :", ""},
	}
	y := 1030
	for _, r := range rows {
		text(img, faceLabel, white, 105, y, r.label)
		text(img, faceVal, white, 105+labelWidth(faceLabel, r.label)+10, y, r.value)
		y += 40
	}
	return png.Encode(w, img)
}

func labelWidth(face font.Face, s string) int {
	return font.MeasureString(face, s).Ceil()
}

func text(dst draw.Image, face font.Face, c color.Color, x, y int, s string) {
	d := &font.Drawer{Dst: dst, Src: image.NewUniform(c), Face: face, Dot: fixed.P(x, y)}
	d.DrawString(s)
}
