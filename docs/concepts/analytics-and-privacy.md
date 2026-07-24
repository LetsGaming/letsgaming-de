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
in parsed output. Only page views survive (asset requests, `/api`, and `/media`
are filtered out), and from each line it keeps the path, the referrer host (not
the full URL), and a coarse user-agent family (browser, OS, mobile-or-desktop,
with no versions). Dimensions: path, referrer, browser, os, device.

Engagement comes from a cookieless beacon. The public site sends small
`navigator.sendBeacon` payloads to `POST /api/pulse` describing already-bucketed,
anonymous activity: which section was viewed and for how long (bucketed), where
the visitor moved to and from, how far they scrolled, and named clicks. The
endpoint validates every event against the shared vocabulary and the live nav,
then increments counters. The endpoint is named neutrally on purpose so
tracker-blockers don't match it. Dimensions include tab, transition, dwell,
scroll, click, exit, project, viewport, and theme.

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

It *can* count **visits**, with a caveat worth stating precisely, because two of
the dashboard's numbers used to be labelled as each other:

| Metric | Dimension | What one row is |
|---|---|---|
| Page views | `path` | one request, from the access log, bots and probes excluded |
| Section views | `tab` | one *section entry* — several per visitor |
| Visits | `session_dwell` | one *completed visit*, emitted once on unload |
| Visit length | `session_dwell` keys | a coarse dwell bucket, shown as a median |
| Bots | `bot` | a request whose agent *admits* to being automated |
| Probes | `probe` | a request that asked for something only a scanner asks for |

"Visits" is completed visits: the summary event fires from `pagehide`, so a tab
the OS kills while backgrounded contributes page views but no visit row. Visits
therefore read slightly under page views by construction. Moving that event
earlier would count visits that hadn't finished, so the number stays honest and
the label says "completed".

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

Classification happens at ingest, so rows written before a rule existed keep
their old dimension. `pnpm analytics:reclassify` re-files them, and is safe to
run repeatedly.

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

**Then page views, on 2xx only.** A human who hits a typo'd URL is a real person
who didn't read a page, so they don't count and their browser doesn't pad the
split either.

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

Both systems write to `analytics_hourly`, keyed by **UTC** hour, so recent data
has hourly resolution and one storage zone. A maintenance pass (`rollupAndPrune`, run by the sync worker)
sums hourly rows older than `RETAIN_HOURLY_DAYS` (default 90) into
`analytics_daily` and prunes the hourly rows, which keeps the table from growing
without bound while long-range daily totals survive. `analytics_state` holds the
log file's byte offset so re-running the ingest is idempotent and never
double-counts. See [data-model](./data-model.md) for the table shapes.

## Which clock the dashboard reads in

Rows are stored in UTC; the dashboard reads them in the owner's zone by default,
with a UTC toggle. That split is not cosmetic:

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

The dashboard also compares each metric against the window immediately before it.
When that earlier window predates any data the comparison is omitted rather than
zeroed, so a new install reads "no earlier data to compare" instead of −100%.

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
