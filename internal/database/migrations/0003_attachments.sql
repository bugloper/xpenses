-- A transaction may carry one attached image (e.g. the payment screenshot
-- shared from a banking app). The file lives under DATA_DIR/attachments/<user>/<id>;
-- the column records its media type, '' when there is none.
ALTER TABLE transactions ADD COLUMN attachment_mime TEXT NOT NULL DEFAULT '';
