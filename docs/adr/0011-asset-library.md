# 0011: An asset library (a bounded DAM)

**Status:** Accepted · 2026 · extends [0008](./0008-small-custom-cms.md)

## Context

The first media model stored files per gallery. To use an image in two places you
uploaded it twice, and there was no way to see where anything was used before
deleting it. That's a real maintenance problem. The small-CMS rule
([0008](./0008-small-custom-cms.md)) warns against growing a DAM, so this needed a
deliberate call rather than a slide.

## Decision

Build a bounded, single-user asset library, not a DAM product. It does what this
site needs and stops:

- Content-hash identity, so the same bytes are stored once no matter how many
  times they're uploaded.
- Images keep a clean original and get responsive WebP and AVIF variants generated
  lazily on first request and cached to disk.
- Folders, tags, search, and per-asset alt, title, caption, and description.
- Usage tracking, so the library shows "used in" and warns before a delete.
- SVGs sanitized on upload and inlined for `currentColor` theming; Markdown assets
  publish at `/md/<slug>`; PDFs get a download link.
- Content references an asset by an `asset:<id>` string, resolved server-side when
  the read API builds the `SiteView`.

No plugin API, no arbitrary content types, no multi-user roles.

## Consequences

- One upload is reusable everywhere: galleries, the hero portrait, inline bio
  images, SVG link icons.
- Pages stay light because variants are lazy and cached, and uploads stay fast.
- New tables (`assets`, `asset_variants`, `asset_folders`, `asset_tags`,
  `asset_usages`, `gallery`) and `/assets/<id>` serving. The old flat `/media`
  routes and Media screen were removed.
- The "small CMS" line moved, on purpose. The test is still "does this project
  need it?", and removing the double-upload problem cleared it.
