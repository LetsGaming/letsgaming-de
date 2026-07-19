-- Cached game metadata (cover art + genre) resolved from RAWG by game name, so a
-- Discord-observed title gets a cover and a genre it never carried on its own.
-- Keyed by the normalized name (trim + lowercase — the same key the resolver looks
-- up), one row per game the sampler has seen and the metadata sweep has resolved.
--
-- A resolved row with NULL cover_url/genre is a real answer ("RAWG has nothing" or
-- "no cover art"), and its presence is what stops the sweep re-querying that name
-- on every run. resolved_at records when, for a future staleness policy.
CREATE TABLE game_metadata (
  name        TEXT PRIMARY KEY,
  cover_url   TEXT,
  genre       TEXT,
  resolved_at TEXT NOT NULL
);
