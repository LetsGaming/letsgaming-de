-- Discord-derived game images, resolved and persisted by the server.
--
-- One row per game (same normalized key as game_metadata). The sampler records the
-- Discord application id and the activity's raw `large_image`; a sweep then walks
-- the fallback chain (activity image, then the application icon) and stores the
-- first URL that actually serves an image in `image_url`.
--
-- `checked_at` stamps an unsuccessful attempt so a miss is retried on a schedule
-- (7 days) instead of on every sweep. A stored `image_url` is never re-resolved.
CREATE TABLE game_images (
  name           TEXT PRIMARY KEY,
  application_id TEXT,
  large_image    TEXT,
  image_url      TEXT,
  checked_at     TEXT
);

CREATE INDEX idx_game_images_pending ON game_images (image_url, checked_at);
