-- Materialized analytics rollups.
--
-- `analytics_hourly` holds every counter at hour resolution for ~90 days and is
-- what the dashboard used to SUM live on each poll. These tables hold the same
-- counters pre-aggregated per grain so a range reads one row per bucket and key,
-- and so history survives hourly pruning at day resolution.
--
--   hour  buckets are UTC hours ("YYYY-MM-DDTHH"), exactly like analytics_hourly.
--   day   buckets are Europe/Berlin calendar days ("YYYY-MM-DD"), 23 to 25 hours
--         long across DST. A day is a wall-clock fact, so it is cut in the
--         owner's zone; a reader in another zone falls back to the hourly rows.
--
-- Rows are derived and fully recomputable per bucket (DELETE then INSERT), so the
-- jobs are idempotent and `pnpm analytics:rollup` can rebuild any range.
CREATE TABLE analytics_rollup (
  grain     TEXT NOT NULL CHECK (grain IN ('hour', 'day')),
  bucket    TEXT NOT NULL,
  dimension TEXT NOT NULL,
  key       TEXT NOT NULL,
  count     INTEGER NOT NULL,
  PRIMARY KEY (grain, bucket, dimension, key)
);
CREATE INDEX idx_analytics_rollup_dim ON analytics_rollup (grain, dimension, bucket);

-- One additive figure per bucket (pageviews, loads, confirmed, ...). A bucket that
-- has a `pageviews` row here is materialized, even when its value is 0.
CREATE TABLE analytics_summary (
  grain  TEXT NOT NULL CHECK (grain IN ('hour', 'day')),
  bucket TEXT NOT NULL,
  metric TEXT NOT NULL,
  value  INTEGER NOT NULL,
  PRIMARY KEY (grain, bucket, metric)
);

-- `through` is the newest bucket the last job computed. It may still have been
-- open when computed, so readers recompute from analytics_hourly from `through` on.
-- `approx` marks the day grain as holding legacy UTC-day rows folded in unchanged.
CREATE TABLE analytics_rollup_state (
  grain       TEXT PRIMARY KEY CHECK (grain IN ('hour', 'day')),
  through     TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  approx      INTEGER NOT NULL DEFAULT 0
);

-- Legacy `analytics_daily` rows (UTC days, written by the old prune) become day
-- rollups, but only for days older than every remaining hourly row: those hours
-- are gone from analytics_hourly, so nothing is counted twice. Pair dimensions
-- (x:*) only ever fed filtered lists and are not rolled up.
INSERT INTO analytics_rollup (grain, bucket, dimension, key, count)
SELECT 'day', day, dimension, key, SUM(count)
FROM analytics_daily
WHERE dimension NOT LIKE 'x:%'
  AND day < COALESCE((SELECT substr(MIN(bucket), 1, 10) FROM analytics_hourly), '9999-12-31')
GROUP BY day, dimension, key;

-- The same days' summary figures, so a 1y range has totals and not just lists.
-- Mirrors summarize() in @lg/core's visit-model for the dimensions that existed.
INSERT INTO analytics_summary (grain, bucket, metric, value)
SELECT 'day', bucket, metric, SUM(count)
FROM (
  SELECT bucket, count,
    CASE dimension
      WHEN 'path' THEN 'pageviews'
      WHEN 'bot' THEN 'bots'
      WHEN 'probe' THEN 'probes'
      WHEN 'viewport' THEN 'loads'
      WHEN 'click' THEN 'clicks'
      WHEN 'tab' THEN 'tabs'
      WHEN 'session_dwell' THEN 'completed'
    END AS metric
  FROM analytics_rollup WHERE grain = 'day'
  UNION ALL
  SELECT bucket, count,
    CASE key
      WHEN '<5s' THEN 'sd_0' WHEN '5-15s' THEN 'sd_1' WHEN '15-30s' THEN 'sd_2'
      WHEN '30-60s' THEN 'sd_3' WHEN '1-3m' THEN 'sd_4' WHEN '3-10m' THEN 'sd_5'
      WHEN '10m+' THEN 'sd_6'
    END AS metric
  FROM analytics_rollup WHERE grain = 'day' AND dimension = 'session_dwell'
)
WHERE metric IS NOT NULL
GROUP BY bucket, metric;

INSERT INTO analytics_rollup_state (grain, through, computed_at, approx)
SELECT 'day', date(MAX(bucket), '+1 day'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1
FROM analytics_rollup WHERE grain = 'day'
HAVING COUNT(*) > 0;
