-- Individual track plays, from Discord's Spotify presence.
--
-- WHY A SEPARATE TABLE FROM presence_sessions
--
-- A play isn't a session. `presence_sessions` has one `name` column because a
-- game or an artist is a single subject — but a track is *song + artist(s) +
-- album*, three things a human wants to slice independently ("top songs", "top
-- artists", "top albums"). Cramming them into one `name` would make two of the
-- three unrecoverable. So music gets its own shape.
--
-- Artists are stored as the raw Discord string ("Icona Pop; Charli xcx") AND
-- split into `music_play_artists`, because "top artists" has to count Charli
-- XCX's solo plays together with her collaborations — the joined string can't do
-- that, and splitting at read time would re-parse on every query.
--
-- WHY IT'S IDEMPOTENT
--
-- Discord dates each track with `timestamps.start` (per-song, not per-session),
-- so `(track_id, started_at)` is the play's identity. Re-polling the same track
-- moves only `last_seen_at`; the same 3-minute song scrobbles once no matter how
-- many times the 5-minute sampler catches it. A replay later is a new
-- `started_at`, which is a new play, which is correct.
--
-- WHAT'S NOT HERE
--
-- Genre and podcast-vs-music. Discord's Spotify presence exposes neither — a
-- podcast episode arrives as type 2 with the show in `artist` and the episode in
-- `song`, indistinguishable from a track. Both would need the Spotify Web API
-- (OAuth, token refresh), a separate source. Recording empty columns for them
-- would be pretending data is coming that isn't.
CREATE TABLE IF NOT EXISTS music_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Spotify track id (`sync_id` in the activity). Stable across plays of the same
  -- track, so it's the join key for "top songs" — two plays of one song group by
  -- this even if the display title were punctuated differently.
  track_id TEXT NOT NULL,
  -- The song title as Discord reports it (`details`).
  song TEXT NOT NULL,
  -- The raw artist string (`state`), e.g. "Icona Pop; Charli xcx". Kept verbatim
  -- for display; the split lives in music_play_artists for counting.
  artist TEXT NOT NULL,
  -- The album (`assets.large_text` / top-level `spotify.album`). Nullable — not
  -- every listen exposes it.
  album TEXT,
  -- ISO. From the track's own `timestamps.start`.
  started_at TEXT NOT NULL,
  -- ISO. Newest poll that still saw this track playing.
  last_seen_at TEXT NOT NULL,
  UNIQUE (track_id, started_at)
);

CREATE INDEX IF NOT EXISTS idx_music_plays_seen ON music_plays (last_seen_at);

-- One row per (play, artist), so a collaboration counts toward each artist.
-- A play with three artists writes three rows; "top artists" sums play durations
-- grouped by artist_key. Cascade-deletes with its play so pruning is one delete.
CREATE TABLE IF NOT EXISTS music_play_artists (
  play_id INTEGER NOT NULL REFERENCES music_plays(id) ON DELETE CASCADE,
  -- Lower-cased for grouping ("Charli xcx" and "Charli XCX" are one artist).
  artist_key TEXT NOT NULL,
  -- The display casing as first seen for this play.
  artist TEXT NOT NULL,
  PRIMARY KEY (play_id, artist_key)
);

CREATE INDEX IF NOT EXISTS idx_music_play_artists_key ON music_play_artists (artist_key);
