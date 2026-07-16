# 0003: Astro + Vue islands, SSR for self-updating

**Status:** Accepted · 2026 · (OVERVIEW)

## Context
The site must be content-driven with near-zero JS, but keep tactile interactions,
and (the north star) never look stale. An initial static build froze content at
build time, breaking "self-updating".

## Decision
Astro for the shell + Vue islands for the interactive bits (leveraging existing
Vue experience). Output is **SSR** (`@astrojs/node`): each request resolves the
current `SiteView` from the read API, briefly cached.

## Consequences
- A sync or CMS edit is live on the next request, no rebuild.
- "Nothing fetched on page load" still holds: SSR reads the local store, not GitHub.
- The web tier is a small Node process instead of static files; trivial next to the
  API process it already runs beside. A CDN can still front it via cache headers.

## Amendment — areas are routes, not hash tabs

The original shipped every area into one document and switched between them with
a hash and an `[hidden]` attribute. That was cheap and it worked, until three
things landed at once:

1. **A hidden nav node wasn't hidden.** Every area was SSR'd into every page, so
   an unpublished area shipped its markup in the HTML of every other one.
   View-source found the draft. "Not visible until I publish it" was false.
2. **The blog already had routes.** `/md/<slug>` renders markdown assets with a
   real 404. `#blog` for the index plus `/md/...` for posts is one feature with
   two URL schemes.
3. **Per-area OG cards were impossible.** A hash never reaches the server, so
   every link pasted into a chat unfurled as the homepage regardless of what it
   pointed at — and chat is how this site gets shared.

So: `/`, `/code`, `/life`, `/about`, one area per document. The tab store, its
setter, the hash reader and the hidden panels are gone.

**This changes how many areas one document renders. It doesn't change the
decision.** Astro + Vue islands + SSR-from-the-local-store all stand, and Astro
was already a file router — `/docs` and `/md/[...slug]` proved it. "Nothing
fetched on page load" still holds.

One thing fell out for free: the resolver strips hidden nodes, so `[area].astro`
can't resolve a draft and 404s it without a guard of its own.
