-- ArtPro catalog schema (Cloudflare D1 / SQLite).
-- One row per art piece. Photos are stored as a blob in the same row and
-- served on demand at /api/pieces/:pid/photo, so the list response stays small.
CREATE TABLE IF NOT EXISTS pieces (
  pid         TEXT PRIMARY KEY,          -- stable server id (uuid)
  photo       TEXT    NOT NULL DEFAULT '', -- display URL: a static path, /api/pieces/<pid>/photo, or ''
  photo_blob  BLOB,                       -- uploaded image bytes (nullable)
  photo_type  TEXT,                       -- image mime type for the blob (nullable)
  art_id      TEXT    NOT NULL DEFAULT '', -- business id shown in the table, e.g. AP-0142
  descr       TEXT    NOT NULL DEFAULT '',
  artist      TEXT    NOT NULL DEFAULT '',
  medium      TEXT    NOT NULL DEFAULT '',
  art_size    TEXT    NOT NULL DEFAULT '',
  frame       TEXT    NOT NULL DEFAULT '',
  loc         TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT '',
  archived    INTEGER NOT NULL DEFAULT 0,
  created     INTEGER NOT NULL DEFAULT 0, -- epoch ms
  updated     INTEGER NOT NULL DEFAULT 0  -- epoch ms
);
CREATE INDEX IF NOT EXISTS idx_pieces_archived ON pieces(archived);
CREATE INDEX IF NOT EXISTS idx_pieces_created  ON pieces(created);
