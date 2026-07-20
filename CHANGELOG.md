# Changelog

## Unreleased

### /life — activity in the right timezone

- **The day strips, the "when I play" heatmap, and the per-day drill-in bucket in the
  owner's timezone, exact across DST.** They aggregate from the raw observed sessions
  (stored UTC) in a named zone via `Intl`, so each session is credited to its own local
  day and hour — a summer session at CEST and a winter one at CET land where they
  actually happened, not an hour off. The heatmap also spreads a session across every
  hour it spans, not just the one it started in. The owner's zone is `TZ` (default
  `Europe/Berlin`); rarely changes for one owner, so it's an env var, not a stored
  setting.
- **"When I play" can be read in the owner's time or the visitor's own.** A toggle in
  the card header re-requests the heatmap bucketed in the chosen zone, and hides itself
  when the visitor is already in the owner's zone (so the owner never sees it). The
  module and day endpoints take an optional `?tz=`, off the same raw-row aggregation —
  so the zone is a parameter end to end and both views are exact, not a rotation of a
  pre-collapsed grid.

### CMS

- **Played has its own list-limit widget, separate from Listening.** The two modules
  no longer share a single limit — each carries its own "always show" / "show at most"
  under Widgets, so their lists can differ. The cap is enforced server-side (the client
  never receives rows past it); the "games played" headline stays the true total even
  when the list is trimmed.
- **The Presence panel reads at a glance.** The two look-alike category grids (show
  live, record to history) are now one table — a row per category with a *Show* and a
  *Record* switch — so the two independent axes are obvious instead of easy to confuse.
- **"Keep history for" has finer choices** — Forever, 2 years, 1 year, 6 months, 3
  months, 1 month — so a short trail is a real option, not just "keep it all or a year".
- **"Hidden games" is now "Hidden activities" and applies to more than games.** A hidden
  name is dropped from the live widget *and* the playtime charts whatever its category —
  a game, a stream, a show — matched case-insensitively. (Placeholder is a concrete
  example now, e.g. `R6`.)
- **The layout editor's drag-and-drop moves the module you actually grabbed, and can
  hide one.** SortableJS reported drop indices that counted each area's non-draggable
  header row, so every drag landed one position off — it moved the wrong module, and
  dragging onto Unplaced silently did nothing. Indices are now counted among the
  draggable rows only.
- **The move rail shows every page, including the one open on the canvas** (marked
  *editing*, rather than hidden), and each module carries a dropdown to send it to
  another page or hide it — the reliable path on touch, where dragging between lists is
  fiddly.

### Refactors

- **Music and Playtime share their strip, timeline, and heatmap wiring** instead of
  mirroring it: the fortnight day-strip and day drill-in are one composable, and the
  ranked row, stat tile, and heat strip one component apiece.
- **Every capped list — the top songs/artists list, the top-games list, and both
  per-day drill-ins — shares one "show N, expand to the cap, then say how many the
  limit hid" composable**, so a change to that behaviour happens in one place instead
  of being reimplemented per section.

### Fixes

- The heatmap grid lines up with its day labels and hour axis; hobby cards reflow to two
  columns on a narrow screen.
- **Drilling into a day on Listening or Played now respects the list's cap.** The day
  panels used to expand to every track or game for that day, ignoring the limit; they
  now show at most `maxCount` with an "and N more" note for the rest — and, like the
  headline lists, the cap is enforced **server-side**, so the browser is never sent the
  rows the limit hides. The day endpoints return the top-N (aggregated per view) plus
  the true totals for the note, never the whole day.

## 2.0.0

A ground-up rework. The design is decided rather than inherited, the areas became
real routes, `/life` gained self-tracked playtime and listening, the data sources
moved off Steam, and the load-bearing seams — SSR, the API boundary, the CMS — were
rebuilt with enforcement so they can't quietly rot again.

### Design and information architecture

- **Areas are routes** — `/`, `/code`, `/life`, `/about`, not hash tabs. Each page
  ships only its own HTML, per-area OG cards work, and navigation is real (crawlable,
  middle-clickable); client-side transitions keep it from reloading the shell.
- **The design system is decided, not ported from the prototype**, and enforced so it
  stays that way. Purple means *now* — live data, the one primary action, the focus
  ring — and nothing else (145 references in `app.css` → 3 selectors). Colour is
  imported from real data, never invented; a card is one subject; elevation on dark is
  surface lightness, not shadow. Rationale in `docs/concepts/design-system.md`.
- **IA:** Work → Code (every repo there is a hobby), highlights folded into activity, a
  hidden markdown-backed Blog (`/md/blog/<post>`), and **staleness as a first-class
  state** (`fresh | stale | empty | failed | never`) on every source-fed module — with
  an empty state for every section, not just some.
- **Motion pared to what earns it** — tilt, staggered entrances, and the mobile drawer
  removed; four labels always fit at 380px.

### /life — self-tracked history

- **"Right now" is present-tense only** — the live dot, identity, current activity. The
  accumulated history split off into its own modules.
- **Playtime** — a fortnight day-strip, a top-games list, a per-day drill-in, and a
  weekday×hour "when I play" heatmap, all from **observed Discord sessions**. A sampler
  records sessions idempotently (keyed by `started_at`, so retries and overlaps can't
  inflate a total) — this is accumulated history, not a re-fetchable source, so it lives
  with analytics, not the sync worker. It covers games Steam never sees.
- **Listening** — the same shape for Spotify: top songs, artists, and albums plus a
  per-day timeline, from the Discord Spotify presence. Album art through the media proxy;
  a lettered monogram where there's none. Honest about what Discord can't give — no
  genre, no podcast-vs-music split, no columns pretending otherwise.

### Data sources

- **Steam dropped and parked.** Playtime is Lanyard-observed now — one consistent
  measurement across every game, covering the non-Steam titles Steam never knew. The
  Steam client stays buildable and under test, but off the registry and the request
  path, revivable from a known-good base.
- **Game cover art and genre from RAWG** (cross-platform, matched by name), resolved on
  an hourly sweep, cached, and re-served through the media proxy. Optional —
  `RAWG_API_KEY` turns it on; without it, monograms and no genre.

### Architecture and correctness

- **SSR reads the store directly.** The per-render `fetch` to the API is gone; the web
  app opens SQLite **read-only** and builds the view in-process with the same
  `buildSiteView` the API uses. WAL keeps the reader live as the sync worker writes.
- **The API boundary has a contract.** `@lg/core/api.ts` describes every endpoint; both
  ends import it and the server's routes are typed to return it, so drift fails the
  typecheck. API-boundary casts 8 → 0, string-to-domain casts 6 → 0.
- **Vocabularies are values, not just unions** (`ASSET_KINDS` + `isAssetKind`, …), so
  every boundary that needs to *check* one has a predicate rather than a cast.
- **Content has history.** Every CMS write archives into `site_content_revisions` inside
  the caller's transaction — a rewritten bio can no longer exist nowhere else. Restore
  writes forward and is itself archived.
- **CMS operations are named for what they do** — one `moveModuleTo` primitive backs the
  ↑/↓ buttons, the area dropdown, and a **drag-and-drop visual editor** that renders the
  real sections and edits a module in place (keyboard path kept). The old cross-document
  iframe canvas and its postMessage protocol are gone.
- **Modules refresh in place** — playtime and music poll like presence via a single
  `GET /api/module/:id` that resolves the same SiteView, so there's no parallel slice to
  drift.
- **One visual language for activity** — the daily timelines and the contribution /
  weekday-hour grids all draw from one `HeatGrid` (with an optional selectable mode); the
  bespoke bar-strip CSS is gone.

### Refactors

- **`useCms` split 1264 → 635 lines** into four focused composables
  (`usePresenceSettings`, `useGuestbookMod`, `useAnalytics`, `useLayoutEditor`), each
  owning its own lifecycle; the existing test suite passed unchanged, which is the proof
  behaviour held.
- **Section styles scoped** — section-specific rules moved out of the 1200-line global
  `app.css` (down to 861) into each component's `<style scoped>`, ending the specificity
  war the deleted iframe once existed to escape.
- **Shared UI extracted** — `HeatGrid`, `RankedRow`, `StatTile`, `HeatStrip`,
  `LanguageBars`, `useDayDrill`, `useLedgerStrip`; Listening and Playtime are built from
  the same pieces.

### Privacy

- **All third-party images are proxied server-side** — Discord avatars/art, RAWG covers,
  Spotify covers — so a visitor's IP never reaches those CDNs. The proxy fetches only
  from a fixed https allow-list, refuses redirects, and caps size (SSRF-safe); an
  art-less game gets a generated labelled tile.
- **Analytics count people, not bots**, cookieless and PII-free — the IP is dropped at
  parse time, self-identifying non-humans are bucketed out of the real stats, and page
  views (a ceiling) are separated from confirmed JS visits (a floor) with no join.

### Tooling and enforcement

- **Two new build gates**, same argument as the existing nav lint: `lint:tokens` fails
  the build on any `var(--x)` that resolves to nothing (CSS never errors on its own), and
  `vue-tsc` typechecks the `.vue` files `astro check` never did — which immediately caught
  two latent null derefs.
- **`canPublish(nav, id)`** — one implementation behind both the build-time nav lint and
  the runtime CMS visibility toggle.
- **A hand-authored OpenAPI 3.1 spec** (`openapi.yml`), parsed at build and rendered as
  an in-site `/docs/api` page — no Swagger CDN, no client-side spec fetch.
- **Dockerfiles rebuilt** multi-stage around `pnpm fetch` + prune-to-`/prod`, for
  dev-dependency-free runtime images.
- **Versioned, forward-only migrations** (`schema_migrations`, per-migration
  transactions, checksum verification) replaced the re-exec'd `schema.sql`; `busy_timeout`
  and `synchronous=NORMAL` added at open, and every DB read is mapped through a checked
  reader (zero force-casts in `@lg/db`).

### Dependencies

- Added: **`vue-tsc`** (typecheck `.vue`), **`sharp`** (image processing), **`nanostores`
  + `@nanostores/vue`** (cross-island state), **`sortablejs`** (drag-drop, admin chunk
  only), and **`yaml`** (dev — build-time OpenAPI parse).


## 1.1.0

Content & CMS expansion: a central asset library, a sectioned admin with live
preview, new sources and sections, a guestbook, on-site docs, and bilingual content
— all still self-updating with no rebuild.

### Features

- **Central asset library** (replaces the flat "Media" model). Upload images, SVGs,
  GIFs, PDFs and Markdown once — deduped by content hash, with responsive WebP/AVIF
  variants generated lazily and cached — then reference them anywhere. Folders, tags,
  search, alt/caption metadata, and "where used" (delete warns first). SVGs are
  sanitized and inlined for `currentColor`; Markdown publishes at `/md/<slug>`, PDFs
  get a download link. Link icons, the hero portrait, and inline bio images all draw
  from it, and galleries pick from it (usage tracked). Drag-and-drop upload and a
  type-scoped picker (`asset:<id>` references resolved server-side, `/assets/<id>`
  serving).
- **Multiple named galleries** — create/delete gallery instances (positioned via
  Layout, the built-in one protected), images scoped per gallery with an alt-text
  field distinct from the caption.
- **Sectioned CMS admin** (WordPress/Typo3-shaped). A grouped left-hand module menu
  replaces the flat tab row; the catch-all Content tab splits into Site identity /
  Home intro / About / Presence. A **Dashboard** shows at-a-glance counts + a "needs
  attention" note, and a **live preview beside the editor** reloads on save and
  follows the area you're editing. Layout can move a module to another area or hide
  it (nav-lint keeps an area non-empty). Preview traffic stays out of analytics.
- **Discord presence widget** (Lanyard + Steam hybrid). The server applies the
  owner's category allow-list and exposes only the permitted result at
  `/api/presence` — the browser never receives the Discord id, the category list, or
  any disabled activity. Categories are toggled in the CMS (no redeploy).
- **Wakapi source** (coding time by language, LAN-only) and **GitHub "Recently
  shipped"** (releases / merged PRs / gists as one newest-first feed) — both standard
  source adapters (fetch → normalize → store → SiteView) with deterministic dev
  mocks, placed via idempotent IA reconciliation.
- **Guestbook** (cookieless, pre-moderated). Honeypot + per-IP rate limit, stored
  minimally (name, message, server timestamp — no IP), with a tested auto-flag
  heuristic that only *sorts* the CMS moderation queue. Approved entries render above
  the signing form.
- **On-site documentation at `/docs`** — the repo's markdown, prerendered with a
  sidebar nav tree, Shiki-highlighted code, and the site's design tokens; adds no
  runtime JS. Intra-doc links rewritten to `/docs/<slug>`.
- **Language switch (English / Deutsch).** Cookieless; SSR picks the locale from
  `?lang` → `Accept-Language` → English, the read API localizes the whole SiteView,
  and untranslated fields fall back to English per-field.
- **Self-populating traffic analytics.** Top paths / referrers / browsers / OS /
  devices are ingested from a configured `ACCESS_LOG` in-process every 5 minutes
  (incremental, idempotent, IP never stored) and bucketed by UTC hour; a nightly job
  rolls buckets older than `RETAIN_HOURLY_DAYS` (default 90) into daily rows and
  prunes the raw hourly. Dashboard gains a **Page views** metric.

### Dependencies & build

- **`pnpm audit` is now clean** (was 2 critical · 4 high · 8 moderate · 2 low):
  happy-dom 15→20, vitest 2→3, nodemailer 7→9, node-cron 3→4, plus a pnpm override
  forcing patched esbuild (≥0.28.1).
- **Prod-pruned runtime images** via `pnpm deploy --prod` — dev tooling (and its
  advisories) no longer ship; the server image drops from ~304 MB to a ~35 MB prod
  tree.

### Fixes

- **Sync runner:** import `ScheduledTask` as a named type (node-cron 4 no longer
  exposes it under the `cron` namespace).
- **CMS:** new hobby/link/now rows get a unique (timestamp-suffixed) id, fixing a
  primary-key collision when adding two rows before renaming either.

## 1.0.0

First stable release. The full vertical slice — GitHub + CMS → store → resolve → read API →
SSR site — runs in production behind Cloudflare + a reverse proxy, self-updating with no rebuild.

### Content & front end
- **Projects are GitHub-driven** — pinned repos first, then most-recently-updated (forks/archived
  excluded), each linking to its real repo. Replaced the hard-coded seed projects.
- **Working contact** — the hero "Get in touch" jumps to a real contact form that posts to the
  no-store email relay; section-to-section navigation for internal anchors.
- Favicon, expanded social-icon set (x, linkedin, mastodon, youtube, discord, instagram, bluesky,
  globe), a "view all repos on GitHub" link, dimmed the purple glow, fixed the contributions
  calendar sizing, removed dev placeholder copy.
- **Settings modal** (replaces the bare theme toggle) with theme selection and a privacy/analytics
  opt-out — extensible for future settings (e.g. language).
- Light-theme accent colours (`purple-br`, `coral`) darkened to meet **WCAG AA** for link/error text.

### Analytics
- Cookieless, identifier-free **engagement analytics** (beacon → `/api/pulse`): section views,
  transitions, dwell (bucketed), scroll depth, named clicks, project opens, coarse viewport,
  visit length, theme — stored **hourly**.
- CMS dashboard: **stacked composition chart** with metric switcher (sections/clicks/visit length),
  hourly/daily resolution, range presets (24h/3d/7d/30d), and **clear-by-range** (last hour … all).
- Honors **Do-Not-Track**; visitor opt-out persists locally. Log-based analytics unchanged
  (day-bucketed, IP dropped at parse).

### CMS
- Removed the redundant projects editor (GitHub-driven); added an in-app guidance note.
- **Fixed delete** (was crashing on a ref/array mix-up — deletion never worked) and added **↑/↓
  reorder** for links, hobbies, and now-rows.
- Bearer token moved to `sessionStorage`.

### Security & dependencies
- Boot-time config validation refuses an empty/default cookie secret when the CMS is enabled;
  empty-string-aware env reader; CORS never reflects an arbitrary origin with credentials; OAuth
  `state` CSRF protection; render-time `href` scheme guard; security headers; contact rate-limiter
  keyed on the real client IP with bounded memory.
- Upgraded **astro 5 → 6**, **@astrojs/node 9 → 10**, **nodemailer 6 → 7** (clears the known
  advisories); Dockerfiles use `--frozen-lockfile`, run as non-root, and copy with `--chown` to
  avoid a heavy extra layer.

### Ops & quality
- **Automated backups** (`scripts/backup.sh`) and the **analytics ingest** (`scripts/ingest-analytics.sh`)
  are now committed and documented.
- Cloudflare named as a processor in the Datenschutzerklärung (IP processing, EU-US DPF transfer).
- Tests: server routes (auth, CORS, media traversal, contact, tracking, clear), engagement
  vocabulary, and a **web render smoke test** (vitest + happy-dom) that catches blank-page / render
  regressions. ~50 tests, typecheck + nav-lint green.

### Known deferrals (post-1.0)
- **Impressum** — deliberately omitted for now (note: legally required for a public German site).
- Nav-label editing in the CMS (data layer supports it; deemed non-essential — labels are stable).
- Playwright end-to-end / hydration test (the smoke test covers component rendering, not full
  SSR-hydration).
- CI actions pinned to SHAs (Dependabot covers action updates weekly).
