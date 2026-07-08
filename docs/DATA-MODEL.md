# Data model

Three kinds of data live in one SQLite store, kept strictly separate: CMS-owned
content (owner edits), source-owned data (synced), and analytics aggregates.
Everything human-authored is `Localized` (`{"en": …, "de"?: …}`).

## Store schema (`packages/db/src/schema.sql`)

### CMS-owned

| Table | Shape |
|---|---|
| `site_content` | singleton (id=1): `meta`, `headline`, `lede`, `status`, `bio` as JSON. |
| `site_ia` | singleton (id=1): `nav` (NavNode[]) + `modules` (ModuleDescriptor[]) as JSON. |
| `projects` | `id, name, tag, description, meta, href, featured, repo, sort` (localized fields JSON). |
| `hobbies` | `id, title, blurb, icon, tone, sort`. |
| `links` | `id, label, href, icon, is_primary, sort`. |
| `now_items` | `id, key, value, sort`. |

The nav tree is stored as JSON (edited rarely, naturally nested) so editing a nav
label is a content change, not a migration. List entities are relational so CRUD
is clean.

### Source-owned

| Table | Shape |
|---|---|
| `source_snapshots` | append-only archive: `id, source_id, synced_at, data` (JSON). Every sync writes one. |
| `source_current` | one row per source: the latest snapshot the site reads. |

`source_snapshots` is why the store outgrows the public API over time — it holds
all-time totals and long-range trends GitHub won't hand you directly. It can't be
re-fetched; **back it up**.

### Analytics

| Table | Shape |
|---|---|
| `analytics_daily` | `(day, dimension, key) → count`. Dimensions: `path`, `referrer`, `browser`, `os`, `device`. |
| `analytics_state` | `(source log path) → byte offset` so re-ingest doesn't double-count. |

No IPs, no identifiers, no per-visitor rows — only counts.

## Content model (`packages/core/src/content.ts`)

`SiteContent = { meta, headline, lede, status, bio, projects, hobbies, links, now }`.

- `SiteMeta` `{ name, handle, location: Localized, role: Localized }`
- `Headline` `{ before, highlight, after }` (each `Localized`) — the highlight word
  gets the underline.
- `Status` `{ verb, now }` — the pulsing "currently building …".
- `Project` `{ id, name, tag, description, meta[], href, featured?, repo? }` — a
  curated card; `repo` optionally links a synced repo for meta enrichment.
- `Hobby` `{ id, title, blurb, icon?, tone }` — tone ∈ purple/coral/mint/sun.
- `NowItem` `{ id, key, value }`.

Prose fields (`lede`, `bio`, project descriptions, now values) support a tiny safe
subset of markdown — `**bold**` only — rendered without raw HTML.

## Normalized source output (`packages/core/src/source.ts`)

The only shape anything downstream sees for GitHub:

```ts
interface GitHubData {
  stats: { repos; commitsYear; commitsAllTime; longestStreakDays };
  languages: { name; pct }[];
  contributions: number[];              // per-day intensity, accumulated
  events: { type: "commit"|"pr"|"star"|"repo"; text; meta?; at }[];
  repos?: { name; stars; pushedAt }[];  // enriches curated project meta
  releases?: { repo; name; tagName; url; publishedAt }[];  // GitHub extras
  mergedPrs?: { repo; title; url; mergedAt }[];
  gists?: { description; url; files; updatedAt }[];
}
```

`commitsAllTime` is summed across every contribution year (GitHub exposes no
lifetime total). `repos` lets a curated `Project` show live stars/freshness.

## SiteView (`packages/core/src/view.ts`)

The **fully resolved** output of `resolveSiteView()` — localized strings (no
`Localized` left), source data folded in, relative times and heatmap buckets
pre-computed. `{ locale, meta, nav: NavView[], modules: Record<id, ResolvedModule>,
syncedAt }`. Each `ResolvedModule` is discriminated by `kind`
(`hero`/`featured`/`glance`/`activity`/`highlights`/`coding`/`projects`/`hobbies`/`now`/`guestbook`/`presence`/`bio`/`contact`);
the frontend maps kind → component and never sees where the data came from.
