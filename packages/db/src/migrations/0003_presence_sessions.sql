-- Observed play sessions, from Discord presence.
--
-- WHY THIS ISN'T A SOURCE
--
-- `source_current` holds a complete current state that the adapter can fetch again
-- tomorrow: GitHub's repos, Steam's last fortnight. The newest snapshot IS the
-- truth, and a missed sync costs nothing.
--
-- Presence is the opposite. `Source.ttl`'s own comment says it — "Discord presence
-- is worthless after a minute" — which is exactly why Lanyard was never registered
-- as a source and why `/api/presence` fetches live. A sample is a *moment*: nobody
-- can hand it back, so a poll that doesn't happen is playtime that never existed.
-- The truth isn't the newest row, it's the accumulation. That's the shape of
-- `analytics_hits`, not of `source_current`, and this table sits with it.
--
-- WHY SESSIONS AND NOT SAMPLES
--
-- The naive version writes a row per poll and multiplies by the interval. At a
-- 5-minute poll that's ±5 minutes of error at each end of every session, and a
-- 20-minute game logged as 5 or as 25 depending on where the samples fell.
--
-- Discord already answers the question: `activities[].timestamps.start` is when the
-- activity began. So a poll doesn't say "playing X now", it says "playing X, since
-- S" — a session with a real beginning. `(category, name, started_at)` is its
-- natural key, and re-seeing it just moves `last_seen_at`. Which makes the sampler
-- **idempotent**: polling twice, or replaying a poll, cannot inflate anything.
--
-- Duration is `last_seen_at - started_at`. The only error left is the tail between
-- the last poll and quitting — bounded by the interval, always an *under*-count,
-- and never compounding. A session that starts and ends between two polls is missed
-- entirely; that's irreducible without holding Lanyard's socket open, and a floor
-- you can explain beats a number you can't.
CREATE TABLE IF NOT EXISTS presence_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Which kind of activity. Only `game` is charted today, but a stream or a
  -- listening session is the same shape and there's no reason to throw it away —
  -- it can't be re-fetched later if we change our minds.
  category TEXT NOT NULL, -- 'game' | 'streaming' | 'music' | 'watching' | 'custom'
  -- The activity name as Discord reports it. Not an id: Discord's
  -- `application_id` is absent for a lot of games, and this is the only name a
  -- human would recognise anyway.
  name TEXT NOT NULL,
  -- ISO. From `timestamps.start` when Discord reports it; otherwise the first poll
  -- that saw the session, which makes the duration a floor rather than a guess.
  started_at TEXT NOT NULL,
  -- ISO. The newest poll that still saw this session running.
  last_seen_at TEXT NOT NULL,
  -- Whether `started_at` came from Discord or from us. A session we timed from
  -- first sight is a different claim than one Discord dated, and the chart
  -- shouldn't have to guess which it's holding.
  started_exact INTEGER NOT NULL DEFAULT 1,
  UNIQUE (category, name, started_at)
);

-- The one query this table exists for: playtime per game since a cutoff.
CREATE INDEX IF NOT EXISTS idx_presence_sessions_seen
  ON presence_sessions (category, last_seen_at);
