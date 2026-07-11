# Changelog

## Unreleased

### Internal — audit-driven rework (phases 1–4)

A four-phase, behaviour-preserving pass over the audit findings that tightens the
load-bearing seams without changing what the site does. Each change is tied to a
finding; the per-phase notes (`REWORK-PHASE1–4.md`) carry the evidence.

- **Phase 1 — data / security / types.** A **versioned, forward-only migration
  runner** (`schema_migrations`, per-migration transactions, sha256 checksum
  verification) replaces the `schema.sql` re-exec and a swallow-all `ALTER … ADD
  COLUMN` in `try/catch`; added `busy_timeout` / `synchronous=NORMAL`. The DB read
  boundary is now **type-safe** — one audited cast in `mapRows`/`mapRow`, every repo
  narrows columns by hand, **zero casts remain in `@lg/db`**. Constant-time
  `secretEquals` (`crypto.timingSafeEqual`); a typed `AppError` + one error handler
  replace **all 38 `reply.code(n).send({ error })` sites** (no internals/stack on
  5xx). DRY helpers (`deleteById`, `setScalar`, `SINGLETON_ID`, a `GuestbookStatus`
  const + guard).
- **Phase 2 — frontend seams.** The `PUBLIC_API_URL` origin (copy-pasted in six
  files) is now one `lib/api.ts`. A `useSubmit` composable + shared `BaseForm` shell
  cut ~85% of the contact/guestbook duplication. `Module.vue` **352 → 47 lines**: an
  exhaustive `Record<kind, Component>` variant map, one typed component per module
  kind. `registerCrud` collapses five PUT+DELETE route pairs; shared `FIELD_LIMITS`
  end client/server drift. Homepage island `client:load` → `client:idle`.
- **Phase 3 — source resilience.** A typed `Result<T, SourceError>` + one shared
  `fetchJson` give every source a **hard timeout** (`AbortSignal.timeout`), typed
  failures, and **no blind retry**. `Source.fetch()` returns a `Result` (was
  throwing); the sync runner **keeps the last-good snapshot** on failure.
- **Phase 4 — tokens, CMS decomposition, homepage islands.** Spacing/radius/
  on-accent and the chart palette are now **design tokens**; `STACK_COLORS` and 138
  raw spacing values were tokenized **byte-for-byte**. `CmsApp.vue` (~770 lines) split
  into **14 per-tab panels** via typed `provide`/`inject`, its scoped styles moved to
  a specificity-preserving `.cms`-namespaced global sheet. The whole-site
  `TabbedSite` island split into **`SiteChrome` + `SitePanels`** over a shared
  nanostores store, with the brand/footer as static HTML so only interactive parts
  hydrate. (Residual: a short in-browser QA pass on homepage animations/deep-links.)
- **Tests moved into a `tests/` folder per package** (`apps/*/tests`,
  `packages/*/tests`), mirroring each `src/` tree; discovery globs and the web
  `tsconfig`/`vitest` includes updated. Server build no longer emits `*.test.ts` into
  `dist/`.

### Dependencies

- Added **`nanostores` + `@nanostores/vue`** (web) — the shared store behind the
  homepage's two-island split; Astro's supported way to share state across islands.

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