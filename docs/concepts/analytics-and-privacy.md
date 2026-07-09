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
over time. It cannot tell you unique visitors, sessions, bounce rate, or
per-person journeys, because those need a cookie or a pseudonymous hash. That's an
accepted trade, not a bug.

## Storage and retention

Both systems write to `analytics_hourly`, keyed by UTC hour, so recent data has
hourly resolution. A maintenance pass (`rollupAndPrune`, run by the sync worker)
sums hourly rows older than `RETAIN_HOURLY_DAYS` (default 90) into
`analytics_daily` and prunes the hourly rows, which keeps the table from growing
without bound while long-range daily totals survive. `analytics_state` holds the
log file's byte offset so re-running the ingest is idempotent and never
double-counts. See [data-model](./data-model.md) for the table shapes.

The dashboard in the CMS reads these aggregates over a chosen time window and can
clear a range. It's read-only over anonymous counts; there's nothing personal to
expose or protect. How to set the log ingest up in production is in
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
