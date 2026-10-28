# Analytics and privacy

The rule is privacy by omission: if collecting something risks GDPR liability,
the site doesn't collect it. That shapes both how analytics works and what's
deliberately left out. This is [ADR-0007](../adr/0007-privacy-by-omission.md).

Everything here is general information, not legal advice. Confirm specifics with a
Fachanwalt für IT-Recht.

## Two systems, both anonymous

The site measures two different things, and neither uses a cookie or stores an
identifier.

Traffic comes from parsing the reverse-proxy access log. The parser
(`apps/server/src/analytics/parse.ts`) is pure and testable, and it never
captures the IP field at all: the line regex matches and discards it, so it can't
reach the store even by accident. A regression test asserts the IP never appears
in parsed output. Asset requests, `/api`, `/media` and redirects are ignored.
Every other line is judged by an ordered rule table
(`apps/server/src/analytics/classify.ts`) into one of four classes: page view,
bot, probe or not found (see [Two ways to not be a person](#two-ways-to-not-be-a-person)).
From a page view it keeps the path, the referrer host (not the full URL), the
referrer category, and a coarse user-agent family (browser, OS,
mobile-or-desktop, with no versions).

Engagement comes from a cookieless beacon. The public site sends small
`navigator.sendBeacon` payloads to `POST /api/pulse` describing already-bucketed,
anonymous activity: which area (page) and which module section was viewed and for
how long (bucketed), where the visitor moved to and from, how far they scrolled,
named clicks, and one `visit` event when the load first shows real engagement.
The endpoint validates every event against the shared vocabulary, the live nav
and the live module ids, then increments counters. It is named neutrally on
purpose so tracker-blockers don't match it.

The dimensions and key formats of both systems are listed under
[Dimensions](#dimensions).

By construction the beacon writes only counters, never raw event rows, so a
single visit can't be reconstructed. The server assigns the time bucket; the
client sends no timestamps. The client IP is used only for a transient in-memory
rate limit and is never stored, the same posture as the contact relay.

## What it can and can't tell you

It can tell you popular paths, referrer sources, browser and OS and device split,
which sections hold attention, how people move between them, and coarse trends
over time. It cannot tell you unique visitors, bounce rate, or per-person
journeys, because those need a cookie or a pseudonymous hash. That's an accepted
trade, not a bug.

It *can* count **visits**, without knowing who made them, by reconciling the two
sources' counters. That is the next section.

## Reconciling the two sources

The log and the beacon each know something the other doesn't, and they cannot be
joined: the log has no identifier, and the beacon carries no path, referrer or
address. So nothing is matched per visit. Every figure is a counter emitted
exactly once per request or once per page load, and the dashboard compares the
totals ([ADR-0018](../adr/0018-visit-model.md)). The funnel, from the widest
count to the narrowest:

| Stage | Source | Dimension | What one count is |
|---|---|---|---|
| Requests | log | sum of the three below | page views + bots + probes (not-found lines are counted separately and are not requests here) |
| Probes | log | `probe` | a request for something only a scanner asks for |
| Bots | log | `bot` | a request that says, or behaves like, automation |
| Page views | log | `path` | a 2xx page served to a browser-like client |
| Script loads | beacon | `viewport` | a page load in which the tracker ran, once per load |
| Confirmed visits | beacon | `visit` | a load that showed real engagement, once per load |
| Completed visits | beacon | `session_dwell` | a visit whose page reported its end on `pagehide` |

Three derived figures come out of it:

- **Beacon coverage** is `loads / page views`: how much of the logged traffic ran
  the tracker.
- **Confirmation rate** is `confirmed / loads`: how many loads became engagement.
- **Unverified views** is `page views - loads`: clients without JavaScript, tracker
  blockers, Do Not Track, opt-outs, and any non-human the classifier missed.

A **confirmed visit** is the `visit` event, sent once per load at the first of
four triggers: scroll to 25 percent, a module section at least half visible, 5
seconds of visible time (a timer paused while the tab is hidden), or a click. The
trigger is the event key. A load that never does any of these is a script load and
nothing more. The headline "visits" number is confirmed visits.

A **completed visit** is `session_dwell`, which only fires from `pagehide`, so a
tab the OS kills while backgrounded contributes a confirmed visit but no completed
one. Completed visits therefore read under confirmed visits by construction.
Moving that event earlier would count visits that hadn't finished, so it stays on
`pagehide`.

Page views are a ceiling and confirmed visits a floor. The log's page views still
include some non-humans (scanners and headless fetchers that pass a user-agent
check), which is why the classifier and the coverage figure both exist. The
dashboard shows both ends and the gap, and never blends them into one invented
number.

**Not measured.** Before the first `visit` event ever recorded
(`quality.confirmationSince`), a confirmed-visit count of 0 means the event did not
exist, not that nobody came. Windows that end before that moment show "not
measured", windows that straddle it are flagged partial, and the dashboard never
estimates confirmations from `session_dwell`.

## Dimensions

Everything stored is a `(bucket, dimension, key) -> count` row. The vocabulary is
in `packages/core/src/engagement.ts`; the server rejects an event whose dimension
or key is outside it.

Log-derived (written by ingest):

| Dimension | Key |
|---|---|
| `path` | the path, query dropped |
| `referrer` | a host, a `utm:<tag>` value, or `direct` |
| `browser`, `os`, `device` | a coarse family, no versions |
| `bot` | a bot family |
| `probe` | a probe family |
| `exclusion` | the classifier rule id that removed the request |
| `traffic` | the class of every counted request: `pageview`, `bot`, `probe`, `notfound` |
| `source` | referrer category of a page view: `search`, `social`, `campaign`, `referral`, `direct` |

Beacon-derived (written by `POST /api/pulse`):

| Dimension | Key |
|---|---|
| `tab` | area id (an area became active) |
| `exit` | area id (last area before leaving) |
| `transition` | `<fromArea>><toArea>` |
| `dwell` | `<area>\|<dwell bucket>` |
| `scroll` | `<area>\|<25, 50, 75 or 100>` |
| `session_tabs` | areas touched per visit: `1`, `2`, `3`, `4+` |
| `session_dwell` | total visit length, a dwell bucket |
| `click` | a named action from a fixed list |
| `project` | a public repo name |
| `viewport` | `mobile`, `tablet`, `desktop` |
| `theme` | a theme id |
| `visit` | the trigger: `scroll`, `section`, `dwell`, `click` |
| `module` | module id (at least half visible, once per load) |
| `module_entry` | module id (first module seen in a visit) |
| `module_exit` | module id (last focused module at leave) |
| `module_dwell` | `<module>\|<dwell bucket>` |
| `module_flow` | `<fromModule>><toModule>` |
| `session_modules` | modules seen per visit: `1`, `2`, `3`, `4+` |

Dwell buckets are `<5s`, `5-15s`, `15-30s`, `30-60s`, `1-3m`, `3-10m`, `10m+`.
Besides these, ingest also writes pair counters (`x:<a>:<b>`) that make
cross-filtering possible; see
[operations/analytics-ingestion](../operations/analytics-ingestion.md#pair-counters-cross-filtering).

## Two ways to not be a person

The probe check runs **before** the agent check. The path is the harder signal to
forge: production logs show secret sweeps arriving as "Googlebot" and "Applebot"
asking for `/.env.bak` and `/api/config`, and a real Googlebot does not do that.
Checking the agent first filed those under "Search engine", which was both wrong
and flattering.

`agent.ts` asks whether a request **claims** to be automated. That catches most of
the volume — Googlebot, uptime pings, `curl` — and misses anything that lies.

`probe.ts` asks whether what it requested **could have been asked for by a person
on this site**. Scanners send a real browser user-agent, so before this existed
they landed in Top paths as "Chrome on Windows": a live dashboard read 1,361 page
views on a site with about forty, and the browser/OS/device splits were mostly
scanner noise.

The signal is unusually clean because it's specific to this codebase. There is no
PHP, no WordPress and no CGI anywhere in a Nuxt application, so `/wp-login.php`,
`/.env` and `/wso.php` are not typos — those paths have never existed here. That
makes the rule a statement about this server's routes rather than a guess about
intent, which is why it can be applied with confidence.

Probes are counted, not dropped: a scan burst is worth seeing, and it's the most
useful thing in the log for knowing you're being enumerated. They just don't
belong in `path`, `browser`, `os`, `device` or `referrer`, which exist to
describe people — the same reasoning that separates bots.

Both checks, and the rest, now live in one ordered rule table
(`classify.ts`), first match wins. Every rule has a stable id, and the id of the
rule that removed a request is stored as the `exclusion` dimension, so the
dashboard can say why traffic was excluded. Beyond the two checks above the table
covers:

- headless and automation markers, HTTP-library agents and link-preview fetchers,
- `HEAD` and write methods against a page,
- user agents with no platform, a malformed engine or version, an embedded URL or
  an unknown trailing product,
- the stale browser rule: a browser older than a floor in `STALE_BROWSER_MIN` is a
  scanner replaying an old user-agent pool, because real browsers auto-update,
- a plain-http `Referer` naming this site (only a script-issued redirect produces
  one, since the proxy upgrades http to https) and listed spam referrers.

**Burst-adjacent** is the one rule that looks past a single line. A scan wave
interleaves one successful `GET /` with dozens of probe and 404 lines in the same
second, so no per-line rule can tell it from a visit. A page view with at least 3
probe or not-found lines within 10 seconds on either side is reclassified as a
bot (`burst-adjacent`). It reads log timestamps only, counted across all clients;
it never reads an address or any identifier, so it can say the log was busy with
attacks at that moment but not who sent a line. A real page view that happens to
coincide with a scan can be lost to it. A confirmed visit cannot, because those
come from the beacon, which the rule does not touch.

Cloudflare sits in front of the site and hides visitor addresses, and no address
is stored in any case, so there is no per-IP logic anywhere in the classifier.

Classification happens at ingest, so rows written before a rule existed keep
their old dimension. `pnpm analytics:reclassify` re-files stored `path` rows, and
is safe to run repeatedly. To re-derive everything under the current rules, use
`pnpm analytics:rebuild` and then `pnpm analytics:rollup`
([operations/analytics-ingestion](../operations/analytics-ingestion.md#repairing-the-aggregates-after-a-rule-change)).

## What counts as a request

Three filters, in order, and the order matters.

**Redirects are dropped.** The reverse proxy upgrades HTTP to HTTPS with a 301,
so every request writes two log lines: the redirect, then the real answer.
Counting both double-counts every visit *and* every scanner probe — this single
`status < 400` was most of what the dashboard was reporting. On a live 16-line
sample it counted 10 page views where 4 pages were served.

**Then classification, on whatever's left, regardless of status.** A probe that
404s is still a probe, and that 404 is the entire security signal; filtering on
success first is what made the probe counts vanish.

**Then not found, then page views.** A 404 or 410 that no probe or bot rule caught
is counted as `notfound` (a dead link, stored as a count and nothing more) and is
not a page view: a human who hits a typo'd URL is a real person who didn't read a
page, and their browser doesn't pad the split either. Only a 2xx that survived
every rule is a page view.

## Naming referrer sources

The log stores a bare hostname. `out.reddit.com`, `www.reddit.com` and
`old.reddit.com` are three lines and one answer, and `t.co` doesn't obviously say
"X". So hosts are stored raw and grouped when the dashboard is **read**, against
a built-in table (ChatGPT, Claude, Steam, Discord, Reddit, GitHub, search
engines, …) plus any custom rules from the CMS.

Sources come from two places, tag first:

1. **`?utm_source=` on the link** (also `ref`, `from`, `source`). This is the one
   that survives. Native apps — the Discord desktop client, the Steam client,
   most messengers — hand a URL to the browser as a fresh navigation with no
   previous page, so those visits arrive header-less and indistinguishable from
   someone typing the address. A tag answers anyway. The value is
   attacker-controlled, so it's capped to 32 characters of `[a-z0-9._-]` before
   it becomes a row.
2. **The `Referer` header**, when there's no tag. Unchanged behaviour.

Both resolve through the same table, so `?utm_source=discord` and a real referral
from `discord.com` land on one line rather than two.

Reading-time grouping is the point of the ordering: classifying at ingest would
bake today's rules into history, so a source added next month would only be
labelled from next month. Grouping on read relabels everything that ever
arrived. Unmatched hosts fall through to themselves — an unrecognised referrer
sending real traffic is exactly what's worth noticing, and it's the prompt to
name it.

## Storage and retention

Both systems write counters to `analytics_hourly`, keyed by **UTC** hour, so
recent data has hourly resolution and one storage zone. `analytics_state` holds
the log file's byte offset so re-running the ingest is idempotent and never
double-counts. See [data-model](./data-model.md) for the table shapes.

The dashboard does not sum `analytics_hourly` live. Jobs in the sync worker
materialize it into two grains in `analytics_rollup` (every dimension and key)
and `analytics_summary` (one additive figure per bucket: page views, loads,
confirmed, completed, bots, probes, clicks, modules seen, and the dwell and
modules-per-visit buckets):

| Grain | Bucket | Kept | Recomputed |
|---|---|---|---|
| `hour` | a UTC hour, `2026-07-17T14` | 14 days | hourly at :05 (current hour and the two before), and 48 hours at the daily job |
| `day` | a Europe/Berlin day, `2026-07-17` | indefinitely | daily at 04:10 Berlin (yesterday and today), and a catch-up at boot |

Every job recomputes whole buckets (delete, then insert, in one transaction), so
it is idempotent and can be re-run by hand with `pnpm analytics:rollup`.
`analytics_rollup_state` records the newest bucket each grain has computed, so a
reader knows what to trust and recomputes the still-open bucket from
`analytics_hourly`.

Retention: hourly rows are kept `RETAIN_HOURLY_DAYS` (default 90). The nightly
maintenance pass (`rollupAndPrune`) drops an hourly row only once its Berlin day is
safely materialized in the day grain, and never half-prunes a day, so history past
90 days survives at day resolution and a 1y range reads real data. Hour rollups
older than 14 days are deleted. `analytics_daily`, the old UTC-day table, is
legacy: retention still writes to it for older tooling, but nothing reads it.

Read path: hour-unit ranges read the hour grain; day-unit ranges read the day grain
when the reader's zone is Europe/Berlin. A day range in any other zone rebuilds
its days from the hourly rows instead, which is limited to the hourly retention
and flagged `range.approximateZone`. Legacy `analytics_daily` history was copied
once into the day grain at the migration and is flagged
`quality.approximateHistory`, because those days were cut in UTC.

## Which clock the dashboard reads in

Rows are stored in UTC; the dashboard reads them in the owner's zone by default,
with a UTC toggle ([ADR-0016](../adr/0016-analytics-timezone.md)). That split is
not cosmetic:

- **Hour buckets stay UTC.** An hour is an hour in any zone, so only the *label*
  moves. This is done client-side.
- **Day buckets are grouped in the reader's zone, on the server.** A day boundary
  is a wall-clock fact: in Berlin the 22:00 and 23:00 UTC hours already belong to
  the next local day. `substr(bucket, 1, 10)` would file them in the wrong column
  and no relabelling could fix it, so the regrouping is done in JS with
  `zonedParts` (`@lg/db/tz.ts`) — the same DST-exact helper the playtime heatmap
  buckets with, applied per instant rather than as a fixed offset.
- **Day windows snap to local midnight**, so the oldest column is a whole day.
  This was a real bug: the window used an *hour* bound while grouping by day, so
  the first day silently lost every hour before the current hour-of-day — up to
  23/24 of itself, varying with the time of day the dashboard happened to be
  open, while the chart drew it as complete.

- **Berlin day buckets are stored, not recomputed per request.** The day grain is
  cut in Europe/Berlin, so a day is 23, 24 or 25 hours long across the DST
  changes, and each hour is bucketed by its own offset rather than a fixed one.
  Readers in Berlin use those rows directly; any other zone falls back to the
  hourly rows and is marked approximate (see
  [Storage and retention](#storage-and-retention)).

The dashboard also compares each headline metric against the window immediately
before it: the same number of buckets, ending exactly where the current window
starts, so the two never overlap. The server computes the delta
(`headline.<metric>.deltaPct`); the client only displays it. When the earlier
window predates any data, or predates the metric (confirmed visits before
`confirmationSince`), the comparison is omitted rather than zeroed, so a new
install reads "no earlier data to compare" instead of −100%.

## What the dashboard shows

The Analytics screen in the CMS reads these blocks of one response:

- **Headline tiles:** page views, confirmed visits, beacon coverage, sections per
  visit, and median visit length, each with its delta and a sparkline.
- **Section flow:** module sections in page order with seen rate, entries, exits,
  dwell, the top module-to-module moves, modules per visit, and scroll depth per
  area.
- **Traffic quality:** coverage, confirmation rate, the funnel above, and why
  requests were excluded (by rule id).
- **Sources:** page views by `search`, `social`, `campaign`, `referral`, `direct`.

The lists of referrers, paths, browsers, OS and devices, bots and probes sit below
them. See [reference/http-api](../reference/http-api.md) for the response shape.

## Reading it without a mouse

The chart is an SVG with `aria-hidden`, paired with a real `<table>` carrying the
same per-bucket numbers — hidden visually, present in the accessibility tree, and
revealable with a toggle. It used to carry `role="img"`, which makes assistive
tech treat the whole plot as one opaque image and ignore anything inside it, so
the values were mouse-only by construction.

The dashboard in the CMS reads these aggregates over a chosen time window and can
clear a range (which reports how many rows it removed). It's read-only over
anonymous counts; there's nothing personal to expose or protect. How to set the
log ingest up in production is in
[operations/analytics-ingestion](../operations/analytics-ingestion.md).

## What still holds

The visit model adds counters and a classifier; it does not add anything that can
identify a person. These guarantees are unchanged:

- **No cookies.** Neither `POST /api/pulse` nor the analytics endpoints set one,
  and the tracker stores nothing on the device except the visitor's own opt-out
  flag.
- **No IPs stored.** The log parser discards the address field. The beacon route
  uses the address only for a transient in-memory rate limit.
- **No identifiers.** No session id, no hash of an address or user agent, no
  per-visitor row. The visit is held in memory in the tab and sent as
  self-contained counters.
- **The beacon is silent when it should be.** It sends nothing when Do Not Track
  is set, when the visitor opted out in Settings, in the CMS preview frame, or when
  `navigator.webdriver` marks an automated browser.
- **Burst detection reads log timestamps only** (plus the class each line already
  got), never an address or any identifier.

`apps/server/tests/privacy.test.ts` holds the first three: no analytics endpoint sets
a cookie, no analytics table has a column that could hold an identifier, and keys
written by ingesting a real log contain no IP-shaped strings.

## The rest of the privacy posture

Contact relays to email and stores nothing. There's no message archive, so
there's little to no personal-data processing. It has a honeypot field and a rate
limit, and it strips CR/LF from the name and email so they can't inject extra mail
headers.

Fonts are self-hosted (Fontsource), so no request leaves the visitor's browser to
a third party. No IP leak, no consent burden.

A short static Datenschutzerklärung ships at `/datenschutz`.

## The Impressum decision

There is deliberately no Impressum. This is a documented, eyes-open risk
acceptance, not an oversight, and it's part of
[ADR-0007](../adr/0007-privacy-by-omission.md).

The reasoning: for a private individual, the Impressumspflicht runs against the
spirit of the DSGVO. It would force publishing a real name plus a ladungsfähige
Anschrift (a P.O. box does not satisfy it) to every visitor and scraper. The owner
prioritises not exposing that data. The acknowledged risk is that a developer
homepage showing work sits close to the geschäftsmäßig line, so the
purely-private exemption under § 5 DDG is not guaranteed to hold, and a missing
Impressum is a known German Abmahnung target. The fallback, if it ever bites or if
the site turns commercial, is to add an Impressum then, ideally with a
Zustellungsbevollmächtigter or c/o address so the home address stays private.

## Upgrade path, kept in mind not built

If unique visitors or richer dashboards ever become worth a small compliance
nuance, the path is a self-hosted Umami or Plausible. Both are cookieless and
avoid raw-IP retention, deriving a "unique visitor" from a short-lived daily
IP+UA+salt hash. That's very likely fine under legitimate interest (Art. 6(1)(f))
and is strengthened by self-hosting, but it's a notch less bulletproof than
retaining nothing, which is why it isn't the default.
