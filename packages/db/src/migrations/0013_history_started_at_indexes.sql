-- The only indexes on presence_sessions/music_plays are keyed on last_seen_at
-- (idx_presence_sessions_seen, idx_music_plays_seen from 0003/0005), but the
-- day/heatmap queries in sessions-repo.ts (heatmap, dailyTotals, dayBreakdown)
-- and music-repo.ts (dailyTotals, dayBreakdown) filter on started_at instead.
-- Both tables are append-only and never pruned by default, so without a
-- matching index those queries fall back to a full table scan as history grows.
CREATE INDEX IF NOT EXISTS idx_presence_sessions_started
  ON presence_sessions (category, started_at);

CREATE INDEX IF NOT EXISTS idx_music_plays_started
  ON music_plays (started_at);
