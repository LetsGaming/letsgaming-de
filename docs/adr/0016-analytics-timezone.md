# 0016: Analytics buckets are stored in UTC and grouped in the reader's zone

Status: **Accepted** — extends [0012](./0012-engagement-analytics.md).

## Context

Both analytics pipelines write to `analytics_hourly`, keyed by a UTC hour string
(`2026-07-17T14`). The dashboard renders those rows as a time series: hourly for
short ranges, daily above 72 hours. Daily grouping was `substr(bucket, 1, 10)` in
SQL, and the whole chart was labelled "time in UTC" in a caption.

Two problems surfaced together.

**The caption was the smaller one.** The dashboard's only reader is the owner, in
Germany. Every column was offset one or two hours from the day they actually
lived, and the reader had to carry that correction in their head while reading
their own traffic.

**The grouping was the real one.** A day boundary is a wall-clock fact, not a
formatting choice. In `Europe/Berlin` the 22:00 and 23:00 UTC hours are already
the next local day. Grouping by the UTC date prefix files an evening's traffic
under the wrong column, and no amount of relabelling moves it back — the sum was
computed over the wrong set of hours.

Alongside it sat a boundary bug with the same root: the window was computed as an
*hour* bound (`now − 719h`) but grouped by day, so the query excluded every hour
of the oldest day before the current hour-of-day. The first column of every 7d
and 30d chart was short by up to 23/24 of itself, by an amount that changed with
the time of day the dashboard was opened, and the client drew it as a full day
regardless. Nothing failed; the number was just wrong.

## Decision

**Store in UTC. Group day buckets in the reader's zone, on the server. Shift only
labels for hour buckets, on the client.**

- `GET /api/cms/analytics` takes an IANA `tz`, defaulting to the owner's zone and
  falling back rather than erroring on anything unrecognised.
- For `unit: "day"`, hourly rows are re-bucketed in JS with `zonedParts`
  (`@lg/db/tz.ts`) — the same DST-exact helper the playtime heatmap and music day
  strips already use. Each instant is bucketed by *its own* offset, so a January
  and a July row both land on the right local day.
- The day window snaps to local midnight, derived by correcting a UTC guess by
  the zone's offset twice: the offset at the naive guess is not necessarily the
  one that applies at the answer, which is exactly the changeover-day case.
- For `unit: "hour"` nothing is regrouped. An hour is an hour in every zone, so
  only the label moves, and that happens in `bucketLabel`.
- `range.timeZone` is echoed in the response so the client never has to assume
  which clock it was handed.

SQL grouping was rejected. SQLite's `'localtime'` reads the one process `TZ`,
which is global and can't vary per request; a fixed `+N hours` offset in the
`substr` expression is wrong on both sides of every DST change. This is the same
reasoning that moved the playtime aggregations off `'localtime'`, and the same
helper serves both.

Doing it in JS means the route pulls hourly rows into the process and groups them
there. That is a local SQLite read on a personal-site row count — the cost is
nothing next to being right about which day a visit happened on.

## Consequences

- Asking for `hours=168` covers seven *whole local days*, which may span up to 23
  hours more than 168. The range is echoed back, so the axis matches the data.
- Day bucket strings in the response are local calendar days; hour buckets remain
  UTC. Consumers must read `range.timeZone` rather than assume.
- The clear endpoint still operates on raw UTC hour buckets, which is correct: it
  deletes storage, not a view of it.
- Two regression tests hold the line — that the first day of a day-unit range is
  complete, and that a 23:00 UTC hit is counted on the *next* Berlin day and not
  the UTC one. Both fail if the grouping moves back into SQL.
