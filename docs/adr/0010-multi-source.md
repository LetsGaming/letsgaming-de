# 0010: More than one data source

**Status:** Accepted · 2026 · builds on [0005](./0005-source-contract.md)

## Context

At launch there was one source, GitHub, and the docs said so. Over time two more
were added: Steam (what I actually play) and Wakapi (self-hosted coding-time
tracking). The point of the Source contract ([0005](./0005-source-contract.md))
was that this would be cheap, so this ADR just records that it happened and how
the shape generalized.

## Decision

Keep one contract for all sources. `SourceData` in `packages/core/src/source.ts`
is a registry of normalized shapes keyed by source id (`github`, `steam`,
`wakapi`). Each source ships a real adapter and a deterministic mock that emit the
same shape. The registry (`packages/sources/src/registry.ts`) selects by config:
a source is real when its credentials are set, mocked in development when they
aren't, and simply absent in production when they aren't.

## Consequences

- Three sources today, added without touching the store, the read API, or the
  frontend beyond one module each.
- Adding a fourth is an adapter, one `SourceData` field, and one registry line.
- Each source polls on its own schedule (GitHub every 6 hours, Steam every 15
  minutes, Wakapi every 30), so a slow or rate-limited source doesn't hold up the
  others.
- Wakapi is LAN-only; the worker reaches it server-side, so nothing is exposed to
  the internet.
