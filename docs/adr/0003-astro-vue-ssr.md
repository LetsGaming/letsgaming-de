# 0003 — Astro + Vue islands, SSR for self-updating

**Status:** Accepted · 2026 · (PROJECT.md §13.2)

## Context
The site must be content-driven with near-zero JS, but keep tactile interactions,
and — the north star — never look stale. An initial static build froze content at
build time, breaking "self-updating".

## Decision
Astro for the shell + Vue islands for the interactive bits (leveraging existing
Vue experience). Output is **SSR** (`@astrojs/node`): each request resolves the
current `SiteView` from the read API, briefly cached.

## Consequences
- A sync or CMS edit is live on the next request — no rebuild.
- "Nothing fetched on page load" still holds: SSR reads the local store, not GitHub.
- The web tier is a small Node process instead of static files; trivial next to the
  API process it already runs beside. A CDN can still front it via cache headers.
