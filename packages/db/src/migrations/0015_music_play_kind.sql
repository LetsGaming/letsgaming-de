-- Separates podcast episodes from songs in music_plays.
--
-- Discord reports a Spotify podcast episode as an ordinary listening activity with
-- no artist (`state`), so the sampler used to store it as a song with artist ''.
-- `kind` records what the activity really was; every music aggregate (top songs,
-- top artists, "tracks played", Wrapped, totals) filters on kind = 'track', so
-- episodes are kept for the owner's history but never counted as music.
ALTER TABLE music_plays ADD COLUMN kind TEXT NOT NULL DEFAULT 'track';

-- Past episodes are exactly the plays recorded without an artist.
UPDATE music_plays SET kind = 'episode' WHERE TRIM(artist) = '';

-- Episodes are recorded under the new `podcast` category. A stored record list
-- that already records music keeps recording everything it did before, now
-- including podcasts; a NULL list already falls back to the default.
UPDATE site_presence
SET sample = json_insert(sample, '$[#]', 'podcast')
WHERE sample IS NOT NULL
  AND json_valid(sample)
  AND sample LIKE '%"music"%'
  AND sample NOT LIKE '%"podcast"%';
