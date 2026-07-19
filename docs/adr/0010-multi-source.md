# 0010: More than one data source

**Status:** Accepted · 2026 · builds on [0005](./0005-source-contract.md) · Steam later removed (see Update)

## Context

At launch there was one source, GitHub, and the docs said so. Over time two more
were added: Steam (what I actually play) and Wakapi (self-hosted coding-time
tracking). The point of the Source contract ([0005](./0005-source-contract.md))
was that this would be cheap, so this ADR just records that it happened and how
the shape generalized.

## Decision

Keep one contract for all sources. `SourceData` in `packages/core/src/source.ts`
is a registry of normalized shapes keyed by source id (`github`, `wakapi`). Each source ships a real adapter and a deterministic mock that emit the
same shape. The registry (`packages/sources/src/registry.ts`) selects by config:
a source is real when its credentials are set, mocked in development when they
aren't, and simply absent in production when they aren't.

## Consequences

- Two sources today (GitHub, Wakapi), each added without touching the store, the
  read API, or the frontend beyond one module each.
- Adding a third is an adapter, one `SourceData` field, and one registry line.
- Each source polls on its own schedule (GitHub every 6 hours, Wakapi every 30
  minutes), so a slow or rate-limited source doesn't hold up the others.
- Wakapi is LAN-only; the worker reaches it server-side, so nothing is exposed to
  the internet.

## Update — Steam removed, RAWG added (not as a source)

Steam was later dropped. Playtime is now built entirely from Lanyard-observed
sessions (see [0014](./0014-guestbook-presence.md)), so the Steam source — which
only ever knew Steam titles — earned its keep no longer. Its fetch client is
parked in `packages/sources/src/steam/`, decoupled and unregistered, so it can be
revived without having rotted; it is not in `SourceData` and not on the sync
schedule.

Game cover art and genre now come from RAWG, but RAWG is deliberately **not** a
`Source`: a source produces one whole-integration snapshot per poll, whereas game
metadata is a per-name lookup resolved lazily for whatever the sampler has seen.
So it's a small adapter (`packages/sources/src/rawg/`) plus a cache keyed by game
name and a server-side sweep, sitting beside the source contract rather than
inside it — the contract stayed the right shape by *not* being stretched to cover
a different problem.
