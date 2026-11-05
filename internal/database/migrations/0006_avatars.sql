-- When the user last set a profile picture (NULL = none). The picture itself
-- is a file under DATA_DIR/avatars/<user id>.jpg; the timestamp lets the
-- browser cache it until it changes.
ALTER TABLE users ADD COLUMN avatar_updated_at TEXT;
