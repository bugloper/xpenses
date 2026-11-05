package auth

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/draw"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"

	apperr "github.com/bugloper/xpenses/internal/errors"
	"github.com/bugloper/xpenses/internal/models"
)

// AvatarSize is the side of the stored picture: square, small enough for a
// badge, large enough for a profile card on a sharp screen.
const AvatarSize = 256

var avatarTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}

// avatarPath is where a user's picture lives, always a JPEG.
func (s *Service) avatarPath(userID string) string {
	return filepath.Join(s.AvatarsDir, userID+".jpg")
}

// SetAvatar replaces the user's picture with the uploaded image: the type is
// sniffed from the bytes, the image is cropped to a centred square, scaled to
// AvatarSize and stored as a JPEG, so the file on disk is small whatever the
// phone sent.
func (s *Service) SetAvatar(ctx context.Context, u *models.User, r io.Reader) (*models.User, error) {
	if s.AvatarsDir == "" {
		return nil, apperr.Internal(errors.New("avatars directory not configured"))
	}
	limit := s.MaxUploadBytes
	if limit <= 0 {
		limit = 10 << 20
	}
	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return nil, apperr.BadRequest("could not read the uploaded file")
	}
	if int64(len(data)) > limit {
		return nil, apperr.Validation("validation failed", map[string]string{"file": "the image is too large"})
	}
	if len(data) == 0 {
		return nil, apperr.Validation("validation failed", map[string]string{"file": "the file is empty"})
	}
	if !avatarTypes[http.DetectContentType(data)] {
		return nil, apperr.Validation("validation failed", map[string]string{"file": "only JPEG, PNG or WebP images can be used"})
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, apperr.Validation("validation failed", map[string]string{"file": "the image could not be read"})
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, squareThumbnail(src, AvatarSize), &jpeg.Options{Quality: 85}); err != nil {
		return nil, apperr.Internal(err)
	}
	if err := os.MkdirAll(s.AvatarsDir, 0o700); err != nil {
		return nil, apperr.Internal(err)
	}
	final := s.avatarPath(u.ID)
	tmp := final + ".tmp"
	if err := os.WriteFile(tmp, out.Bytes(), 0o600); err != nil {
		return nil, apperr.Internal(err)
	}
	if err := os.Rename(tmp, final); err != nil {
		_ = os.Remove(tmp)
		return nil, apperr.Internal(err)
	}
	at := fmtTime(now())
	if err := s.Repo.SetUserAvatar(ctx, s.DB, u.ID, &at); err != nil {
		return nil, apperr.Internal(err)
	}
	u.AvatarUpdatedAt = &at
	return u, nil
}

// Avatar returns the path of the user's picture, or a not-found error.
func (s *Service) Avatar(u *models.User) (string, error) {
	if u.AvatarUpdatedAt == nil {
		return "", apperr.NotFound("profile picture")
	}
	p := s.avatarPath(u.ID)
	if _, err := os.Stat(p); err != nil {
		return "", apperr.NotFound("profile picture")
	}
	return p, nil
}

// RemoveAvatar deletes the picture; the user goes back to initials.
func (s *Service) RemoveAvatar(ctx context.Context, u *models.User) (*models.User, error) {
	if err := s.Repo.SetUserAvatar(ctx, s.DB, u.ID, nil); err != nil {
		return nil, apperr.Internal(err)
	}
	if s.AvatarsDir != "" {
		_ = os.Remove(s.avatarPath(u.ID))
	}
	u.AvatarUpdatedAt = nil
	return u, nil
}

// squareThumbnail crops the centre square of img and scales it to size×size.
func squareThumbnail(img image.Image, size int) image.Image {
	b := img.Bounds()
	side := min(b.Dx(), b.Dy())
	x0 := b.Min.X + (b.Dx()-side)/2
	y0 := b.Min.Y + (b.Dy()-side)/2
	crop := image.Rect(x0, y0, x0+side, y0+side)
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	// Transparent PNGs land on white rather than black.
	draw.Draw(dst, dst.Bounds(), image.White, image.Point{}, draw.Src)
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, crop, draw.Over, nil)
	return dst
}
