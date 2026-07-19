# The CMS

The CMS is small and custom on purpose. That was true at launch and it's still
the rule, but the line has moved, and this doc is honest about where it sits now.
The launch decision is [ADR-0008](../adr/0008-small-custom-cms.md); the additions
since then have their own ADRs, linked below.

## The rule, and why it exists

Scope discipline is treated as a feature. The point was never "as few features as
possible" for its own sake. It's that a personal site does not need Typo3 or
WordPress, and a general-purpose CMS is a maintenance liability for one person:
plugins to keep current, a permissions model nobody uses, an admin surface far
bigger than the content behind it. So every proposed feature is measured against
one question: does this project actually need it?

That question has said yes a few times since launch. When it does, the feature is
built narrowly, for this site, and it stops where the need stops. It doesn't grow
a plugin API or a settings page for options nobody will change. The difference
between "the CMS grew" and "the CMS is turning into a platform" is whether each
addition is bounded, and these are.

## What the CMS covers

Everything on the site that isn't pulled from an API. Grouped the way the admin
groups it:

- Identity, the home intro (headline, lede, status), and the bio.
- Hobbies, links, and "right now" rows.
- The asset library and the galleries (see below).
- Presence curation: which Discord categories the widget may reveal.
- Guestbook moderation: approve, reject, or delete visitor entries.
- Layout: reorder modules within an area, move them between areas, or hide them,
  all still checked against the nav lint.
- An analytics dashboard over the anonymous aggregates.

Projects and activity are not editable, because they come straight from GitHub.
To change what shows, pin or unpin repos on the GitHub profile or push to them,
and the site catches up on the next sync. The task-level walkthrough is in
[guides/using-the-cms](../guides/using-the-cms.md).

## What it stays away from

No plugin system, no page builder, no arbitrary content types, no user
management beyond the single owner, no workflow or roles. Auth is GitHub OAuth
(one allowed login) or a bearer token, and it fails closed when neither is
configured. The API is a handful of `/api/cms/*` routes plus one admin island.

## The asset library

The asset library is the largest thing the CMS grew, and the one most worth
explaining, because on paper "asset library" sounds like exactly the kind of DAM
the small-CMS rule warns against. It's built as a bounded, single-user media
manager, not a DAM product, and it earned its place by removing a worse problem:
the old model stored files per gallery, which meant re-uploading the same image
to use it twice and no way to see where anything was used. This is
[ADR-0011](../adr/0011-asset-library.md).

What it does:

- One upload, reused anywhere. Identity is the content hash (sha256), so the same
  bytes are stored once no matter how many times they're uploaded.
- Accepts images, SVGs, GIFs, PDFs, and Markdown. Images keep a clean original and
  get responsive WebP and AVIF variants generated lazily on first request and
  cached to disk, so uploads stay fast and pages stay light. SVGs are sanitized on
  upload and inlined so they inherit `currentColor` for theming. Markdown assets
  publish as their own page at `/md/<slug>` in the site shell. PDFs get a download
  link.
- Organised with folders, tags, and search, with per-asset alt text, title,
  caption, and description.
- Usage-aware. Each place an asset is referenced is recorded, so the library shows
  "used in" and warns before you delete something that's still in use.

How it's referenced: content fields that hold an image store an `asset:<id>`
string rather than a path. The read API resolves that to a rendered `<picture>`
(or inline SVG) when it builds the `SiteView`, so the stored content stays a
stable reference and the rendition details live in the asset layer. Library images
can go into galleries, the hero portrait, inline bio images, and uploaded SVG link
icons.

Serving: `GET /assets/:id` returns the canonical file; `GET /assets/:id/:variant`
returns a specific rendition, generating and caching it on first request;
`GET /api/assets/md/:slug` returns a Markdown asset's content for its page. The
tables (`assets`, `asset_variants`, `asset_folders`, `asset_tags`,
`asset_usages`, `gallery`) are in [data-model](./data-model.md).

## Guestbook and presence

Two smaller additions, combined in [ADR-0014](../adr/0014-guestbook-presence.md).

The guestbook is a pre-moderated, cookieless visitor message: name, message, and a
server timestamp, nothing else. An entry is stored as pending and never shown
until the owner approves it in the moderation queue. An auto-flag score sorts the
queue by how suspicious an entry looks, but a human always decides.

Presence shows what Domenic is doing right now (a game, music, a stream) via
Lanyard. The server, not the browser, talks to Lanyard, applies the owner's
category allow-list, and returns only what's permitted. The client never receives
raw Lanyard data, never learns the Discord id, and never sees a category the owner
disabled. Which categories show is edited in the CMS; the Discord id lives in the
environment.
