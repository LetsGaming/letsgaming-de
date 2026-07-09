# Data model

Three kinds of data live in one SQLite store, kept strictly separate: CMS-owned
content (owner edits), source-owned data (synced from adapters), and analytics
aggregates. Everything human-authored is `Localized`, a `{ "en": "...", "de"?:
"..." }` JSON object, so German is a content task later rather than a schema
change.

The schema is `packages/db/src/schema.sql`, and that file is the source of truth.
The tables below are grouped by which kind of data they hold; for exact columns,
read the schema.

## CMS-owned content

Singletons (one row, `id = 1`) hold the scalars and the structure, because
they're edited rarely and are naturally nested, so JSON documents beat a spread
of columns.

| Table | Holds |
|---|---|
| `site_content` | `meta`, `headline`, `lede`, `status`, `bio`, all as JSON |
| `site_ia` | `nav` (the `NavNode[]` tree) and `modules` (the descriptor list) |
| `site_presence` | `show`: which presence categories the widget may reveal |

List-shaped content is stored relationally so CRUD stays clean.

| Table | Holds |
|---|---|
| `projects` | curated project cards; localized `tag`/`description`/`meta`, plus `href`, `featured`, an optional `repo` link to a synced repo, and `sort` |
| `hobbies` | the "off the clock" tiles; localized `title`/`blurb`, an `icon`, a `tone` (purple, coral, mint, or sun), and `sort` |
| `links` | social and contact buttons; localized `label`, `href`, `icon`, `is_primary`, `sort` |
| `now_items` | the "right now" rows; localized `key`/`value` and `sort` |

The nav tree is JSON inside `site_ia` on purpose: editing a nav label is then a
content edit, not a migration. See
[information-architecture](./information-architecture.md).

## The asset library

A central, reusable set of files referenced from anywhere by id. Identity is the
content hash, so the same bytes are stored once no matter how many times they're
uploaded. Design and rationale are in [the-cms](./the-cms.md); the pipeline (hash,
sanitize, lazy variants, serving) is in the same doc.

| Table | Holds |
|---|---|
| `assets` | one row per file: `hash` (sha256, the dedupe key and `UNIQUE`), `kind` (image, svg, gif, pdf, markdown, file), `mime`, `bytes`, `width`/`height`, an optional `slug` for Markdown pages, and metadata (`alt`, `title`, `caption`, `description`) |
| `asset_variants` | cached derived renditions of an image, one row per (`format`, `width`); `format` is webp or avif |
| `asset_folders` | optional nesting for organisation; `parent_id` self-references |
| `asset_tags` | free-form tags, one row per (`asset_id`, `tag`) |
| `asset_usages` | where each asset is referenced (`context` like `gallery:travel`, `hero`, `link:github`, `md:about`), so the CMS can show "used in" and warn before a delete |
| `gallery` | images placed on the site; each row references a library asset via an `asset:<id>` string, belongs to a gallery `module`, and has a localized `caption` |

Content fields that hold an image (the hero portrait, a link's SVG icon, inline
bio images, gallery entries) store an `asset:<id>` reference string. The read API
resolves those to a rendered `<picture>` (or inline SVG) at request time, so the
stored content stays a stable reference and the rendition details live in the
asset layer.

## Visitor-submitted: the guestbook

| Table | Holds |
|---|---|
| `guestbook` | pre-moderated entries: `name`, `message`, a server-assigned `created_at`, a `status` (`pending`, `approved`, `rejected`), and `flags`/`score` |

Cookieless and minimal: name, message, and a server timestamp only. No IP, no
identifier. Nothing is public until `status = 'approved'`. `flags` and `score`
are auto-computed hints that only sort the moderation queue; a human always
decides. The scoring lives in `packages/core/src/guestbook.ts`.

## Source-owned data

| Table | Holds |
|---|---|
| `source_snapshots` | append-only archive: `source_id`, `synced_at`, and the normalized `data` (JSON). Every sync writes one row. |
| `source_current` | one row per source: the latest snapshot, which is what the site reads |

`source_snapshots` is why the store outgrows the public API over time. It holds
all-time totals and long-range trends that GitHub won't hand you directly. It
can't be re-fetched, so it's the thing you back up (see
[operations/backups](../operations/backups.md)). The normalized shapes per source
are in [sources-and-sync](./sources-and-sync.md).

## Analytics aggregates

| Table | Holds |
|---|---|
| `analytics_daily` | `(day, dimension, key) -> count`. Log-derived traffic stats, rolled up. Dimensions: path, referrer, browser, os, device. |
| `analytics_hourly` | `(bucket, dimension, key) -> count`, bucketed by UTC hour. Engagement events plus recent traffic, so the dashboard can show hourly resolution. |
| `analytics_state` | `(log path) -> byte offset`, so re-running the ingest doesn't double-count |

No IPs, no identifiers, no per-visitor rows, only counts. Old hourly rows are
bundled into daily rows and pruned on a schedule to keep the volume flat. The two
systems, the dimensions, and the retention are in
[analytics-and-privacy](./analytics-and-privacy.md).

## The content model in code

`packages/core/src/content.ts` defines the shapes the CMS reads and writes.
`SiteContent` gathers `meta`, `headline`, `lede`, `status`, `bio`, `projects`,
`hobbies`, `links`, `now`, `gallery`, and `presence`. The pieces worth naming:

- `SiteMeta`: `{ name, handle, location, role }`, where `location` and `role` are
  `Localized`.
- `Headline`: `{ before, highlight, after }`, each `Localized`; the highlight word
  gets the underline.
- `Status`: `{ verb, now }`, the pulsing "currently building ..." line.
- `Project`: a curated card; its optional `repo` links a synced repo so the card
  can show live stars and freshness.
- `Hobby`, `Link`, `NowItem`, `GalleryItem`: the list entities above.

Prose fields (`lede`, `bio`, project descriptions, "now" values) support a small
safe subset of Markdown, `**bold**` only, rendered without raw HTML, so stored
content can't inject script.

## SiteView: what the frontend actually gets

`resolveSiteView()` in `packages/core/src/resolve.ts` produces `SiteView`
(`packages/core/src/view.ts`), the fully resolved output the read API returns.
Fully resolved means: strings already localized for the requested locale (no
`Localized` left), source data folded in, relative times and heatmap levels
pre-computed, asset references turned into renderable image views. Its shape is
`{ locale, meta, nav, modules, syncedAt }`, where `modules` is a map from id to a
`ResolvedModule` discriminated by `kind`. The kinds match the `ModuleKind` union
(hero, featured, glance, activity, highlights, coding, projects, hobbies, now,
guestbook, presence, gallery, bio, contact). The frontend walks `nav`, looks up
each leaf's module ids in `modules`, and switches on `kind`. It never learns
where a module's data came from.
