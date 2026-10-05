-- Anonymous one-click reactions (the hero "wave"). One global counter per kind and
-- nothing else: no visitor, no IP, no timestamp. Rate limiting lives in memory in
-- the server and is never persisted here.
CREATE TABLE IF NOT EXISTS reactions (
  kind  TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
