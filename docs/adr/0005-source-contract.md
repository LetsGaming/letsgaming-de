# 0005: The Source contract (normalized-only seam)

**Status:** Accepted · 2026 · (OVERVIEW)

## Context
Adding data sources over time must be cheap and must not ripple through the store,
API, or frontend.

## Decision
Every integration implements one interface: `Source<Raw, Normalized>` with
`fetch()` and `normalize()`. Only the normalized shape crosses the store/API/
frontend boundary. Raw API shapes never leak past `normalize()`.

## Consequences
- Adding a source = one adapter + one registry line + one `SourceData` field.
- `fetch`/`normalize` split keeps normalization pure and unit-testable.
- The frontend renders normalized JSON and can't tell which API data came from.

## Amendment — `ttl`, and an explicit async pass

Two fields, both learned from use.

**`ttl: number`.** `schedule` is how often we poll; `ttl` is how long the answer
stays true. They're different questions and only one of them the visitor cares
about. Discord presence is worthless after a minute; a fortnight of Steam
playtime is fine an hour old. Past its TTL a module renders `stale` — the data
plus its age — rather than pretending to be current.

A `ttl` shorter than `schedule` means the source is stale by design: GitHub polls
every 6h, so its TTL is 8h (one missed sync of slack), not the 2h that first
looked right. That's a config error, not a strictness setting.

**`enrich?(normalized)`.** `normalize` is pure and synchronous, and that's worth
keeping — it's what makes the pipeline testable without a network. But some
enrichment genuinely needs I/O: sampling a Steam game's dominant colour out of
the icon the normalized shape points at. Doing it in `fetch` doesn't work,
because the thing to fetch is only known once `normalize` has built the URL.

So the async step is named rather than making the pure one lie. Failures inside
degrade to the un-enriched shape — enrichment is a bonus, not a dependency, and a
decorative field should never cost a sync.

Adding a source is still: one adapter + one registry line + one `SourceData`
field + a `ttl`.

## Amendment — where the `ttl` lives

The recipe above was true on paper and false in the code. Each adapter declared
its own `ttl`, its mock declared the number again, and the read API ignored all
six and used a third table (`SOURCE_TTL`, keyed by `string`) in the registry. So
a source added exactly as documented got a `ttl` nothing consumed — and because a
missing TTL resolves to `fresh` rather than to an error, the module would have
claimed to be current forever. The one bug the freshness model exists to prevent,
reachable by following the instructions.

`SOURCE_TTL` now lives in `core/source.ts` beside the contract, typed
`Record<SourceId, number>`, and adapters set `ttl` from it. The table is the value
and `Source.ttl` is a view of it, so there is nothing to keep in sync. The type is
what enforces the recipe: add a field to `SourceData` and the table stops
compiling until it has a TTL and a label.

It stays static rather than being derived from the registered sources, because an
unconfigured source still has rows in the store and their age still has to be
judged. Deriving it would put the holes back.
