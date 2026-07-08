# Changelog

## Unreleased

### Features

- **CMS: finish the module/media gaps.** Layout now does more than reorder within an area — you can
  **move a module to another area** or **hide it** (drop it from every area), all still validated
  against nav-lint (an area can't be left empty). Galleries went from one to **many**: create/delete
  named gallery instances (each is a gallery module you position via Layout; the built-in one is
  protected), with images **scoped per gallery** and an optional **alt-text** field distinct from the
  caption. An additive column migration backfills existing gallery rows. The on-site **CMS guide**
  (`docs/USING-THE-CMS.md`) was rewritten to match the new sidebar admin.
- **CMS: media is no longer a dead-end.** Uploaded images can now be **deleted**
  (`DELETE /api/cms/media/:file`, same traversal-safe filename guard as serving) and, more
  importantly, **placed on the site**. A new **`gallery` module** (Life → "Snapshots") renders a
  captioned image grid; from the **Media** tab you add an image to the gallery with one click, and
  the **Gallery** tab lets you caption, reorder, and remove entries. Gallery images are CMS-owned
  content, resolved into the SiteView like everything else; the public site prefixes media URLs with
  the API origin so they load correctly. Deleting an upload also removes it from the gallery.
- Both land as the usual full slices (validated routes, store-backed, resolved server-side, dev-safe
  defaults), and the new gallery module reaches an existing store via the IA reconciliation.
- **CMS redesign — a small WordPress/Typo3-shaped admin.** The flat tab row is now a grouped
  **left-hand module menu** (Content · Structure &amp; media · Widgets · Community · Insights), and the
  old catch-all "Content" tab is split into focused screens — **Site identity**, **Home intro**,
  **About / bio**, and **Presence** each get their own section, so it's obvious what you're editing.
  A new **Dashboard** landing shows at-a-glance counts (hobbies, links, gallery, media, modules) with
  jump-in links and a "needs attention" note when guestbook entries are pending. A **Live preview**
  screen embeds the real site in a frame and reloads after every save (plus a persistent
  "View site ↗"). Preview traffic is kept out of analytics on both paths — the client beacon stays
  silent when framed or `?preview=1`, and the access-log parser skips those requests — so previewing
  never inflates your own stats. Content-only change — no data-model impact.
- _CMS rework now covers reordering, media delete + integration, a sectioned admin, a dashboard,
  and a live preview. Further nice-to-haves (drafts, revision history) remain deliberately out of
  scope for a single-user site._
- **Discord presence widget (Lanyard + Steam hybrid, server-filtered, CMS-curated).** A new **Life →
  "Right now-ish"** widget shows live Discord status and activities plus a **"Recently on Steam"**
  section. **The server does the filtering**: it fetches Lanyard, applies the owner's category
  allow-list, and exposes only the permitted result at `/api/presence` (shared cache keyed on the
  allow-list). The browser polls that endpoint and **never receives the Discord id, the category
  list, or any disabled activity** — the backend is the filtering boundary, like every other source.
  Which categories show (`game / streaming / music / watching / custom / steam`) is edited in the
  **CMS (`/admin` → Presence toggles)** and stored as CMS-owned content — no redeploy to change it;
  toggles take effect on the next poll. Spotify is de-duped into one clean card; Steam data is
  withheld unless its category is enabled. Only the Discord id and Steam credentials stay in env.
- **Wakapi source (coding time by language).** A new **Work → "What I actually work in"** module
  shows tracked coding hours per language from a self-hosted, WakaTime-compatible Wakapi instance —
  the honest counterpart to GitHub's byte counts. Wakapi is **LAN-only**: the sync worker reaches it
  over the local network (server-side, like every source), so nothing is exposed to the internet;
  a private `WAKAPI_URL` + read key is all it needs.
- Both are standard **source adapters** (same contract as GitHub — fetch → normalize → store →
  SiteView, with deterministic dev mocks), register only when configured, and their modules reach an
  existing store via the IA reconciliation. `.env.example` and `docker-compose.yml` document the new
  variables.
- **Guestbook (cookieless, pre-moderated).** Visitors can leave a name + short message in a new
  **Life → Guestbook** section; nothing is public until the owner approves it. Submissions go
  through a honeypot + per-IP rate limit and are stored minimally — name, message, server timestamp,
  **no IP, no identifier** — matching the site's privacy stance. A lightweight, tested auto-flag
  heuristic (links / caps / profanity / length / repetition) scores each entry to *sort* the CMS
  moderation queue (it never auto-rejects — a human decides). The CMS gains a **Guestbook queue tab**
  (pending-first, most-suspicious-first) with approve / reject / delete. Approved entries are folded
  into the SiteView by the resolver (with relative times) and render as cards above the signing form.
  New module placement reaches the live store via the existing IA reconciliation. The
  Datenschutzerklärung gains a Gästebuch section (please review the wording).
- **On-site documentation at `/docs`.** The repo's own `docs/` markdown now renders on the site
  with a sidebar nav tree (grouped: Overview + ADRs), Shiki-highlighted code, and styled tables —
  reusing the site's design tokens. Built with an Astro content collection over the repo's `docs/`
  folder and prerendered (one static page per doc), so it adds no runtime JS and ships baked into
  the image; docs refresh on the next deploy like any code change. Intra-doc `.md` links are
  rewritten to `/docs/<slug>` (with heading anchors preserved) and links that point outside `docs/`
  (e.g. package READMEs) become GitHub blob URLs — all via one tested helper. `/docs` redirects to
  the docs README; a footer link makes it discoverable.
- **Language switch (English / Deutsch).** The settings modal gains a Language control that reloads
  the page in the chosen language and remembers it (cookieless — `localStorage`, like the theme). SSR
  picks the locale from an explicit `?lang`, then the browser's `Accept-Language`, then English, and
  the read API localizes the whole SiteView for it — untranslated fields fall back to English
  per-field, so partial translations are fine. `<html lang>` is set accordingly, and a tiny no-flash
  inline script (index only) honours a returning visitor's stored choice. The CMS already edits both
  locales (the EN/DE editor toggle), so German is now purely a content task — no schema change.
- **GitHub extras — a "Recently shipped" section.** A new `highlights` module surfaces
  **releases, merged pull requests, and public gists** as one friendly, newest-first feed
  (each row a plain-language line — "Released …", "Merged … in …", "Shared a gist: …" — linking
  out to GitHub). It sits in **Work**, between Activity and Projects. Source-owned like the rest
  of the GitHub data: the adapter fetches it (one extended GraphQL round-trip + the existing
  REST events), `normalize()` bounds and sorts it, and the resolver folds it into the SiteView
  with pre-computed relative times — the frontend stays a dumb renderer. The dev mock includes
  sample extras so it renders end-to-end without a token. Because nav/module placement lives in
  the DB (seeded once, not CMS-editable), boot now runs an **idempotent IA reconciliation** that
  registers and places any newly-added launch module, so the section appears on the existing
  production store without a manual migration.

### Dependencies & build

- **Dependency advisory sweep — `pnpm audit` is now clean** (was 2 critical · 4 high · 8 moderate ·
  2 low). Bumped **happy-dom 15→20** and **vitest 2→3** (clears both criticals + the transitive
  `vite`/`esbuild` highs), **nodemailer 7→9** (contact relay — the only advisory on a request
  path), and **node-cron 3→4** (drops its vulnerable `uuid@8.3.2` transitive; v4 has zero deps).
  Added a pnpm override forcing patched `esbuild` (≥0.28.1) for the dev-only, Windows-only advisory
  via astro. Removed the now-redundant `@types/node-cron` (node-cron 4 ships its own types).
- **Runtime images are prod-pruned.** Both Dockerfiles now build the workspace and then
  `pnpm deploy --prod` a self-contained tree (built `dist` + prod deps + the compiled sharp addon),
  so **dev tooling — and its advisories — no longer ship in the deployed container**. The server
  image drops from copying the whole ~304 MB workspace to a ~35 MB prod tree. Each app package
  gained `files: ["dist"]` so the (gitignored) build output is included in the deploy. The deploy
  root is the package root, so in-container entrypoints/commands are now package-relative
  (`dist/index.js`, `dist/analytics/cli.js`, …) — analytics-ingest script and DEPLOYMENT docs
  updated to match.

### Fixes

- **Sync runner:** import `ScheduledTask` as a named type (node-cron 4 no longer exposes it under
  the `cron` namespace).
- **CMS:** new hobby/link/now rows get a unique id (timestamp-suffixed) instead of a fixed default,
  fixing a primary-key collision when adding two rows before renaming either.

- **Hourly analytics + rollup retention.** Log-derived stats (page views, referrers, browsers…)
  are now bucketed by **UTC hour** like engagement, so the dashboard can show page-views-over-time.
  A nightly job **bundles hourly buckets older than `RETAIN_HOURLY_DAYS` (default 90) into daily
  rows and prunes the raw hourly** — recent data stays hour-resolution, older data becomes
  day-resolution, and the volume stays bounded no matter how long the site runs.
- Dashboard chart gains a **Page views** metric (stacked by path).
- Note: on first deploy, page-view data logged *before* this change stays day-bucketed in the
  archive and won't appear in the ≤30-day hourly view; new data flows in immediately and the view
  fills within its window.

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
