# 0012: Cookieless engagement analytics

**Status:** Accepted · 2026 · extends [0007](./0007-privacy-by-omission.md)

## Context

The log-based traffic analytics ([0007](./0007-privacy-by-omission.md)) show
paths and referrers, but not which sections hold attention or how people move
between them. Getting that normally means a cookie or a session id, which the
privacy posture rules out.

## Decision

A cookieless beacon. The site sends already-bucketed, anonymous events to
`POST /api/pulse` via `navigator.sendBeacon`: which section was viewed and for how
long (bucketed), transitions, scroll depth, and named clicks. The server validates
every event against the shared vocabulary and the live nav, then increments
counters only. The time bucket is assigned server-side; the client sends no
timestamps. The endpoint is named neutrally so tracker-blockers don't match it.

Events are written to `analytics_hourly` for hourly resolution, and a maintenance
pass rolls rows older than `RETAIN_HOURLY_DAYS` into daily rows and prunes them.

## Consequences

- Section-level engagement insight with no cookie, no identifier, no per-visitor
  rows, so a single visit can't be reconstructed.
- Still can't report unique visitors or sessions, by design.
- Storage stays flat over time because old hourly rows roll up to daily.
- The client IP is used only for a transient rate limit and is never stored, the
  same posture as the contact relay.
