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
