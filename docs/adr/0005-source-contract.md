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
