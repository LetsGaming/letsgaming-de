# 0014: Guestbook and presence widget

**Status:** Accepted · 2026 · within [0007](./0007-privacy-by-omission.md) and [0008](./0008-small-custom-cms.md)

## Context

The site wanted a little visitor interaction and a "what I'm doing right now"
without breaking the privacy posture ([0007](./0007-privacy-by-omission.md)) or
turning the CMS into a platform ([0008](./0008-small-custom-cms.md)). Two small,
bounded features, recorded together.

## Decision

Guestbook: cookieless and pre-moderated. An entry stores a name, a message, and a
server timestamp, nothing else, no IP and no identifier. It's saved as pending and
never shown until the owner approves it in a moderation queue. A honeypot field and
a per-IP rate limit keep casual spam down, and an auto-flag score sorts the queue
by how suspicious an entry looks, but a human always decides.

Presence: the server, not the browser, calls Lanyard, applies the owner's category
allow-list, and returns only what's permitted. The client never receives raw
Lanyard data, never learns the Discord id, and never sees a disabled category. The
category curation is CMS-owned; the Discord id lives in the environment. Steam data
enriches it when configured.

## Consequences

- Interaction and presence both stay inside privacy by omission: nothing personal
  is stored, and the presence filter happens server-side like every other source.
- The guestbook is a moderation queue, not a live comment system.
- Both are single-user and add no plugin or platform surface, so the small-CMS
  rule still holds.

## Amendment — presence stays whole, and unreachable is not offline

**One subject, two sources.** Presence was nearly split into a Discord module and
a gaming module. It shouldn't be: the card is *one* subject — gaming — fed by two
sources, and it already ladders internally (live activity, then the fortnight of
Steam). Splitting it would have made two cards that each answer half a question.
Recorded so nobody re-splits it.

**Unreachable is not offline.** `status` falls back to `"offline"` when no
snapshot has loaded, and the Lanyard fetch swallowed its errors — so a network
failure rendered "Offline", a specific factual claim about a person, generated
from not knowing.

This module is Life's anchor and the site's floor ("a visitor notices the thing
is alive"), and it depends on a third party. Its failure state has to say
something true rather than something confident. It now distinguishes: last
snapshot when there is one (old-and-labelled beats blank), "Can't reach Discord ·
status unknown" when there isn't.

Note `live` in the resolved view only ever meant *Discord is configured* — never
that it answered. The client half reports its own state.
