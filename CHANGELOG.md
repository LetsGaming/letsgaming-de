# Changelog

## Unreleased

### Design rework — the look gets decided instead of inherited

`OVERVIEW.md` said "the look is locked from the prototype", `app.css` said
"faithfully ported from the prototype", `tokens.css` said "the prototype's 'bold
but soft' system". The design had been decided once and ported ever since. This
re-decides it, and adds the enforcement so it can't quietly un-decide itself.
Rationale and rejected alternatives live in `docs/concepts/design-system.md`.

**Three rules, each greppable.**

- **Purple means now.** `--live` has three named jobs — live/just-happened data,
  the one primary action per view, the focus ring. It previously had nine, which
  is the same as none: **145 purple references in `app.css` → 3 selectors**, and
  **6 hardcoded near-miss purples → 0**. The aurora (`--bg-glow`), the purple
  shadow tokens, the active-tab pill, the featured gradient slab, the settings
  modal's three purples and the eyebrow are gone. Selected states use ink vs
  muted, never hue.
- **Colour is imported, never invented.** Real GitHub linguist language colours
  behind a lightness floor (linguist has no dark-background contract — JSON is
  `#292929`); Steam bars sampled from each game's own icon at sync. Steam
  previously used `ACCENTS[i % len]` — a game's colour depended on its position
  in the list. The house palette (`--coral`/`--mint`/`--sun`) is gone.
- **A card is one subject.** Elevation on dark is surface lightness, not shadow —
  a drop shadow at `#131215` has nothing to fall onto, which is *why* the
  prototype's shadows carried glow. `--surf-0..3` + `--line-1..2`; hover is +1
  surface on interactive elements only; press is `translateY(2px)`.

**Behaviour changed, deliberately.**

- **Areas are routes** (`/`, `/code`, `/life`, `/about`), not hash tabs. Deletes
  the tab store, `setTab`, `areaForTarget`, the hash reader, the `[hidden]`
  panels — **including the `$activeTab` atom the previous rework's Phase 4
  introduced**. Not a reversal of that work: it was correct while two islands had
  to agree on a tab, and the URL now knows instead. Every area used to SSR into
  every page, so the whole site shipped in each page's HTML; per-area OG cards
  were impossible because a hash never reaches the server.
- **IA: `Work` → `Code`** (there was no work on it — every repo there is a hobby
  repo), `highlights` merged into `activity` (a release *is* an event; two feeds
  sorted by the same key), `glance` re-scoped from a verbatim duplicate of Code's
  stat bar to the pulse, and a hidden `Blog`. Five areas — **at the
  `MAX_CHILDREN` cap**.
- **Staleness is a first-class state.** `fresh | stale | empty | failed | never`
  on all six source-fed modules; every one of the ten sections now has an empty
  state (four had none). `Source` gains `ttl` — distinct from `schedule`, which is
  how often we ask, not how long the answer holds.
- **Blog.** Posts are markdown assets namespaced `blog/`, rendered at
  `/md/blog/<post>`, metadata in frontmatter, drafts 404 behind a derived
  preview link. New CMS editor panel.
- **Motion.** Tilt removed — it advertised interactivity on `<div>`s that do
  nothing. The staggered `.rise` entrance removed (it re-fired on every tab
  switch). The mobile burger and its drawer, scrim, scroll-lock and Escape trap
  removed: four labels fit at 380px and always did; the *chrome* didn't, and the
  rules removed the chrome.
- **Copy.** The eleven mono kickers deleted at source (they were `note` fields);
  the hero eyebrow removed; `made with a lot of purple` → the sync time.

**Bugs found by doing the work, not by reading it.**

- **`.vue` was never typechecked.** `typecheck` was `astro check`, which covers
  no Vue at all; `vue-tsc` wasn't installed. The exhaustive
  `Record<ModuleKind, Component>` map was decorative. Wired in — it immediately
  found **two latent null derefs** (`FeaturedSection`'s null project,
  `PresenceWidget`'s null activities), both missing-state bugs.
- **The nav's breadth cap was never enforced at the root.** `MAX_CHILDREN` was
  checked against `node.children`; the top row is a *forest*. A tenth area would
  have passed CI.
- **`reconcileIa` could never have shipped this IA.** It matches leaves by node id
  and only adds — it cannot rename `work`, retire `highlights`, or create `blog`.
  The whole IA change was code-only and would never have reached a seeded store.
  Added a structural pass (rename/retire/add-node), idempotent, with a test that
  rewinds a store to the live shape and migrates it forward.
- **Analytics ingest failed silently.** `if (r.hits) log.info(...)` — zero hits
  logged *nothing*, so an unparseable log was byte-identical to no log. The parser
  wants nginx/Apache combined; Caddy and Traefik default to JSON. Now warns once
  with the first unreadable line.
- **An unreachable Discord rendered "Offline"** — a factual claim about a person,
  generated from a network error. Presence is Life's anchor and the site's floor,
  and it depends on a third party; it now distinguishes not-loaded from offline.
- **Hidden nodes weren't hidden.** `hidden` was set and read by nothing.
  `visibleNav()` strips drafts in the resolver, so the router can't resolve one —
  enforcement falls out of the architecture rather than a guard.

**Enforcement — two new build gates, same argument as `lint:nav`.**

- **`lint:tokens`** fails the build on any `var(--x)` that resolves to nothing.
  It exists because CSS never errors: the token rename left **twelve dead
  references across six files** while typecheck, tests and build all stayed green
  and the page rendered wrong. Found two more on its first run.
- **`canPublish(nav, id)`** — `lint:nav` runs at build, the CMS visibility toggle
  runs at runtime. One implementation, both surfaces.
- **`vue-tsc`** in `typecheck`, closing the hole above.
- **`CLAUDE.md`** at the root: the brief, the three rules, the gate. The original
  finding was never purple — it was that nothing had been re-decided since the
  prototype, and this is what notices next time.

**Contract changes.**

- `Source` gains `ttl: number` and an optional `enrich?(normalized)`. `normalize`
  stays pure and synchronous — sampling a colour out of an image needs I/O, so the
  async step is named rather than making the pure one lie. Enrichment failures
  degrade to the un-enriched shape.
- `NavNode` gains `hidden?: boolean`. Counts for breadth/depth (rot surfaces at
  build, not at toggle), exempt from the thin-leaf rule (a draft is empty until
  it isn't).
- `ActivityView extends SectionMeta` instead of hand-copying its two fields —
  which is how it silently missed `freshness`.
- `assets.setContent(id, hash, bytes)` — markdown only. The library is
  content-addressed, which is right for media and wrong for a document you edit;
  the repo's `update` type correctly refuses `hash`, so the exception is named
  rather than the general path widened.
- `slugify` is path-aware, so a markdown asset can be namespaced.
- `previewToken` lives in `apps/server`, not `core`: core is bundled for the
  browser, and a bearer-token secret has no business there. The bundler caught it.

**Docs.** `OVERVIEW.md` §Design rewritten; `information-architecture.md` updated
(new tree, hidden nodes, the runtime guard); `design-system.md` added; ADRs
**0003** (routes), **0005** (`ttl`/`enrich`), **0006** (root bug, drafts,
`lint:tokens`), **0013** ("degrade quietly" was too broad), **0014** (presence
stays whole; unreachable ≠ offline) amended.

**Known-incomplete.** `--live` is a `#8a2be2` placeholder pending a measurement
of the actual LED strip. `cms.css` still speaks the old token vocabulary behind a
scoped, greppable compat shim in `tokens.css` (`[data-density="compact"]`),
deletable with the CMS's own pass. The editor's image/link pickers use
`window.prompt`. German copy is CMS-side. No in-browser QA pass.

### Dependencies

- Added **`vue-tsc`** (web) — `.vue` files were previously unchecked.
- Added **`sharp`** (sources) — Steam icon colour sampling at sync.

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

### Privacy

- **Presence images are now proxied through our own server.** The "Right now-ish"
  module's images (Discord avatar/activity art, Steam icons, Spotify covers) were
  loaded directly by the browser, so the visitor's IP reached those CDNs. They're
  now fetched **server-side** and re-served from this origin — the browser never
  contacts Discord/Steam/Spotify, so no visitor data is transferred to them (the
  status/activity text was already server-only). The proxy fetches only from a
  fixed host allow-list over https, refuses redirects, and caps size (SSRF-safe).
  Datenschutzerklärung updated to match. Where a game has no art from the API
  (e.g. Valorant), the server returns a **generated labelled tile**, so imageless
  activities show a tidy fallback instead of a blank box (per-game overrides can be
  added server-side).

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