-- Merge presence sessions of one activity that overlap in time.
--
-- Discord can report a single game twice in the same poll: League of Legends
-- arrives as two linked applications (each names the other in `official_game_id`)
-- with different `timestamps.start`. Each was stored as its own session, so the
-- shared stretch of play was summed twice and the game's total ran long.
--
-- From now on `observe` merges overlapping sessions as they are written. This
-- repairs the ones already stored: every run of overlapping sessions for a
-- (category, name) becomes one session from the earliest start to the latest
-- sighting. Sessions that do not touch each other are left alone, so two separate
-- evenings of the same game stay two sessions.
--
-- A session that starts exactly when the previous one was last seen counts as the
-- same run. `started_exact` keeps its weakest value: one inexact session makes the
-- merged total a floor, as it does everywhere else.
CREATE TEMP TABLE merged_sessions AS
WITH ordered AS (
  SELECT
    id, category, name, started_at, last_seen_at, started_exact,
    MAX(last_seen_at) OVER (
      PARTITION BY category, name
      ORDER BY started_at, id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS seen_before
  FROM presence_sessions
),
flagged AS (
  SELECT
    *,
    CASE WHEN seen_before IS NULL OR started_at > seen_before THEN 1 ELSE 0 END AS opens_run
  FROM ordered
),
runs AS (
  SELECT
    *,
    SUM(opens_run) OVER (
      PARTITION BY category, name
      ORDER BY started_at, id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS run
  FROM flagged
)
SELECT
  category,
  name,
  MIN(started_at) AS started_at,
  MAX(last_seen_at) AS last_seen_at,
  MIN(started_exact) AS started_exact
FROM runs
GROUP BY category, name, run;

DELETE FROM presence_sessions;

INSERT INTO presence_sessions (category, name, started_at, last_seen_at, started_exact)
SELECT category, name, started_at, last_seen_at, started_exact
FROM merged_sessions
ORDER BY started_at;

DROP TABLE merged_sessions;
