# 0018: A visit model built from aggregate reconciliation

**Status:** Accepted · 2026 · extends [0012](./0012-engagement-analytics.md) and [0016](./0016-analytics-timezone.md)

## Context

The dashboard read 236 page views and 0 visits for the same window. Both numbers
were correct for what they counted, which was the problem.

Page views come from the reverse-proxy access log: one line per request, with no
knowledge of whether a browser ran anything. Visits came from the beacon, and only
from the summary event the page sends on `pagehide`. Two sources, two failure
modes, and no way to join them: the log has no identifier, the beacon has no path
or address, and adding one to bridge them is the thing [0007](./0007-privacy-by-omission.md)
rules out.

The gap had several causes that the old model could not tell apart. Many of the
236 were not people: scanners and headless fetchers with a browser user agent pass
a user-agent-only check. A real visit whose tab is backgrounded and killed (common
on mobile) never fires `pagehide`, so it left page views and no visit. And a
tracker the visitor's blocker drops, or that Do Not Track silences, leaves a page
view with no beacon at all. Meanwhile other numbers around them had drifted:
`analytics_daily` was never read (a 1y range silently lost everything older than 90
days), and day-range deltas compared against a window that overlapped the current
one.

## Decision

**Reconcile at the aggregate level. No identifier of any kind.** Every figure is a
counter emitted exactly once per request or once per page load, and the dashboard
compares counters, never records:

| Stage | Source | Counter |
|---|---|---|
| Probes | log | `probe` |
| Bots | log | `bot` |
| Page views | log | `path` |
| Script loads | beacon | `viewport`, once per load |
| Confirmed visits | beacon | `visit`, once per load, at first engagement |
| Completed visits | beacon | `session_dwell`, on `pagehide` |

From these come three derived figures: beacon coverage (`loads / page views`),
confirmation rate (`confirmed / loads`) and unverified views (`page views - loads`).
The definitions live in one file, `packages/core/src/visit-model.ts`, shared by the
server and the web app.

**A confirmed visit is a one-time `visit` event at first engagement.** The tracker
sends it once per load, the first time any of four triggers fires, and the trigger
is the key: `scroll` (25 percent of the page), `section` (a module section at least
half visible), `dwell` (5 seconds of visible time, on a timer paused while the tab
is hidden) or `click`. It is flushed at once, so it does not depend on `pagehide`.
A bare load never confirms, however long it sits hidden. The `pagehide` summary
stays as it was and is now labelled completed visits.

**Module sections are measured with an `IntersectionObserver`.** It watches
`section.module-section[id]` and emits `module`, `module_entry`, `module_dwell`,
`module_flow`, `module_exit` and `session_modules`, all validated against the live
module ids. Area events are unchanged. The closing events go to the front of the
pagehide batch, and the server cap rose to 80 events, so a truncated flush cannot
drop the summary.

**The classifier is one ordered rule table** (`classify.ts`). Each counted line
gets a class (page view, bot, probe, not found) and a rule id, kept as the
`exclusion` dimension. New rules cover headless markers, HTTP libraries, link
previewers, `HEAD`, platformless and stale-browser user agents, bad referrers, and
`burst-adjacent`, which uses log timestamps only. Ingest holds back the last 10
seconds of lines so a burst is judged with its full window.

**Rollups are materialized at two grains.** `analytics_rollup` and
`analytics_summary` hold hourly buckets (UTC) and daily buckets (Europe/Berlin,
so a day is cut where the owner lives, [0016](./0016-analytics-timezone.md)).
Reads come from the rollups, with the open bucket topped up from
`analytics_hourly`; a day range in another zone falls back to the hourly rows and
is flagged approximate. Deltas are computed server-side over two non-overlapping,
equal-length windows.

**Migrations are reversible.** The runner learns `NNNN_name.down.sql`, with
`pnpm db:migrate:down --to <version>`. `0021` ships the first pair.

## Consequences

- Confirmed visits are "not measured" before the first `visit` event. The
  dashboard shows that instead of a 0, and never infers confirmations from
  `session_dwell`. `confirmationSince` marks the cutover.
- Log page views include some non-humans, and that cannot be fixed per request
  without an identifier. This is why coverage and the classifier both exist:
  coverage says how much of the log ran a script, and the classifier shrinks the
  rest. Confirmed visits are the floor, page views the ceiling, and the gap is
  shown rather than blended into one number.
- `burst-adjacent` can misclassify a real log page view that happens to coincide
  with a scan. It can never lose a confirmed visit, because those come from the
  beacon, which the rule does not read.
- Cloudflare hides visitor addresses behind its own, and the server never stores an
  address anyway, so there is no per-IP logic. Scan detection rests on paths, user
  agents, referrers and timestamps.
- Classifier changes apply to new lines. Re-deriving history means
  `pnpm analytics:rebuild` followed by `pnpm analytics:rollup`.
- `analytics_daily` is legacy: still written by retention, no longer read. Its
  pre-rollup history was copied into the day grain once and is marked approximate,
  because those days were cut in UTC.
- The privacy posture is unchanged: no cookie, no stored address, no identifier,
  and the beacon still honours Do Not Track, the owner's opt-out, preview frames
  and `navigator.webdriver`.

## Alternatives rejected

- **An ephemeral daily hash** (IP, user agent and a rotating salt) to join log
  lines to beacons. It would give real per-visit numbers, but it is a pseudonymous
  identifier built from an address, which is exactly the line
  [0007](./0007-privacy-by-omission.md) draws. Counters that reconcile are weaker
  and honest.
- **Areas only.** Keep the page-level events and skip module sections. It leaves
  unanswerable the question of which parts of a page hold attention, because a
  page is made of several modules and area events cannot tell them apart.
- **`pagehide` only.** Keep visits as completed visits. This is the model that
  produced 0 confirmed visits next to 236 page views: it undercounts every
  backgrounded or killed tab and treats a missing event as a missing visit.
