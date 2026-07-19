# Changelog

## Unreleased

### Feature — Playtime and Listening update in place; area tabs stop reloading

Two ends of the same complaint: nothing but presence refreshed without a reload,
and every tab switch reloaded the whole site.

- **Client-side navigation.** `Layout.astro` gained Astro's `<ClientRouter />`, so
  switching areas (and any same-origin link) is a soft swap, not a full document
  reload — the shell, CSS, and self-hosted fonts aren't refetched, and `<html>`
  persists so `data-theme` doesn't flash. Islands re-hydrate on swap, which is
  exactly where the polling below restarts for the new page and tears down for the
  old. The one casualty was the docs mobile drawer: its per-page inline script
  bound handlers on parse, which silently dies under view transitions
  (soft-navigating *into* a docs page swaps the markup in without re-running its
  scripts). Replaced both copies with one **delegated** controller in the layout —
  binds once on `document`, resolves the current elements at click time, no-ops off
  the docs pages.
- **Modules that refresh themselves.** `playtime` and `music` now poll the way
  presence does. A new `GET /api/module/:id` resolves the *same* SiteView the SSR
  page builds and hands back one module — one resolver, one shape, no parallel
  "just this slice" path to drift out of sync. `useLiveModule` mirrors
  `usePresence`: start from the SSR data, swap in a fresh copy every 60 s, keep the
  last good copy on a hiccup, and stop when the island unmounts so nothing runs for
  a page you've navigated away from. A runtime `kind` check keeps a wrong id from
  rendering another module's data. Wiring any other module for live refresh is now
  two lines.

### Change — The per-day strips are heatmaps now; the columns are gone

`HeatGrid` (the contribution / weekday-hour grid) gained an optional **selectable**
mode — same cells, but `<button>` instead of `<i>`, a `select` event, and a
highlighted `selectedIndex`. Static callers are untouched. With that, the two
remaining column-bar strips — Listening's daily timeline and Playtime's ledger —
became single-row `HeatGrid`s: one cell per day, coloured by minutes, clickable to
drill in. So the site draws "activity over days" exactly one way instead of a bar
strip here and a heatmap there, and the bespoke `.mu-bar` / `.pt-col` layout and
selection CSS went out with the columns.

### Fix — Listening's lists reconcile with its counts, and the day drill follows the tab

Two things were off in the `music` module:

- **"Tracks played" hid tracks the day view showed.** The top-songs and top-artists
  lists applied a sub-minute floor *and* a hard cap of twelve, while the "tracks
  played" / "different artists" headline counts and each day's breakdown applied
  neither — so a short or lower-ranked track appeared when you drilled into its day
  but was missing from the list, and the count never matched what was listed.
  Dropped the floor and the cap from all three aggregate lists (a brief play now
  sorts to the bottom instead of vanishing), so the list, the count, and the day
  breakdown finally agree. Two tests pin it, each proven to bite by mutation.
- **Clicking a day while on "different artists" showed tracks.** The day drill
  always rendered the raw tracks from `/api/music/day`, ignoring which stat you'd
  opened. It now follows the active tab: on *songs* it shows that day's tracks, on
  *artists* it aggregates them into that day's artists — splitting collaborations
  the same way the top-artists list does.

### Docs — A self-documenting `openapi.yml`, rendered as an API tab in /docs

The backend had no machine-readable contract. Added a hand-authored OpenAPI 3.1
spec at the repo root (`openapi.yml`) covering the whole surface — the public
read/relay endpoints, the auth flow, and the CMS — with prose descriptions that
carry the *why* (the server-is-the-boundary posture, the privacy stance), and
either concrete schemas for the stable public shapes or references by name to the
`@lg/core` contract types for the larger CMS ones. A new `/docs/api` page renders
it in the site's own design — grouped operations with method badges, parameter and
response tables, a schemas section — with no Swagger CDN and no client-side spec
fetch: the spec is parsed at build (a `yaml` dev-dependency) and the page
prerenders. It shows up as a "Reference → API reference" entry on every docs page.

### Refactor — Presence enablement decoupled from `DISCORD_USER_ID`; read API split; shared heatmap and drill-in extracted; web components regrouped

A cluster of structural cleanups, each verified green:

- **Presence enablement is a CMS decision, not an env one.** `PresenceModuleView.live`
  became `enabled`, computed purely from the CMS allow-list
  (`show.some(isLivePresenceCategory)`) with zero `DISCORD_USER_ID` involvement —
  the `discordId` pass-through is gone from `ResolveInput`, `buildSiteView`, the
  read/CMS routes, and the web SSR loader, and neither the compose file nor
  `.env.example` hand the secret to the web process any more. The widget always
  polls (its fetch loop moved out to `usePresence` + a `presence-api` service) and
  renders a plain offline or "nothing to show" state; whether Discord is wired up
  stays the server's business. Supersedes the earlier "name what's missing" config
  message — enablement no longer depends on the id at all.
- **One read route per concern.** `presence.ts` is the Discord relay only now;
  `playtime.ts` (`/api/playtime/day`) and `music.ts` (`/api/music/day`) are their
  own modules. Presence is "right now"; the day breakdowns are accumulated history
  — different jobs, different files.
- **The duplicated bits became components.** `HeatGrid.vue` is the one
  level-coloured cell grid the contribution graph and the weekday-hour map both
  draw (each keeps its own bucketing — threshold vs. linear quartile — because
  those are genuinely different questions, not one abstraction). `useDayDrill.ts` is
  the one drill-in state machine behind both the playtime and music day views, with
  per-concern `playtime-api` / `music-api` fetchers. The dead global `.heat` and
  scoped `.pt-heat` CSS went with the duplication.
- **The flat `components/` pile is grouped** into `shell/`, `forms/`, `ui/`, and
  `presence/` (with `sections/` and `cms/` as they were); every relative import
  across sections, cms, pages, and tests was repointed, and the typecheck confirms
  it.

### Fix — Recently played is a ranking, not a shelf; presence config made legible

Two follow-ups after the /life split landed:

- **Recently played was a horizontal scroll shelf; it's now a stacked ranking**,
  matching the Listening top-lists exactly (rank · icon · name · hours, source dot
  and a `+` when the number is a floor). One row style for both "what I've played"
  and "what I've heard", so the two read as siblings down the page.
- **"Presence isn't configured" was a dead end.** It fires purely on the SSR
  `live` flag, which is false whenever `DISCORD_USER_ID` isn't in the process
  building the view — so a running site with real playtime could still show a blank
  presence card with no hint why. The message now names what's missing
  (`DISCORD_USER_ID` + a live category in the CMS + the Lanyard join), and dev now
  actually loads it: the server dev script reads the monorepo-root `.env`
  (`--env-file-if-exists`), and `astro.config` points `envDir` at the root, so
  `pnpm dev` picks up `DISCORD_USER_ID`/`DB_PATH`/`PUBLIC_API_URL` from one shared
  file instead of relying on the shell exporting each. No effect on the built
  images, which get config from real environment variables.

### /life — "Right now" is the live moment; history moved to "Time played"

The presence card had drifted into two jobs: the live moment *and* a fortnight of
gaming history (a "recently played" list and a per-game playtime chart). Those are
different tenses on one card. Split by tense:

- **Right now** (`presence`) is present-tense only. It keeps the live dot, the
  identity header, the current activity (fetched client-side), and — the one synced
  fact it still carries — the game Steam says is being played *this second*. The
  fortnight list and the merged playtime chart are gone from it.
- **Time played** (`playtime`) gains a **Recently played** shelf: the last games
  over the fortnight, Steam's totals merged with observed non-Steam games, each row
  flagged with which half it came from (`source`) and whether the number is a true
  total or a floor. This is history, so it belongs here next to the ledger and the
  heatmap.

Mechanically: `PresenceModuleView` lost `steam.recent` and `playtime`; `steam` is
now just `{ playing }`. `PlaytimeModuleView` gained `recent`. The `mergePlaytime`
call moved from the presence resolver case to the playtime one, still gated on the
same `game` category and hidden-games filter, so nothing the owner hid surfaces.
`PresenceWidget.vue` shed its whole Steam section (template, script, ~190 lines of
now-dead CSS: 792 → 600 lines); `PlaytimeSection.vue` grew the shelf. The resolver
tests that asserted the old presence shape were rewritten to the new contract, plus
new tests that the shelf lands in playtime, is merged and flagged correctly, and is
category-gated — each proven to bite by mutation.

### Fix — the public site rendered no presence, playtime, or music

The three store-backed `/life` modules showed nothing on the public site while the
CMS showed them fine — because they reach the data by different paths. The CMS
talks to the running read API directly; the public site's SSR (`loadSite`) resolves
the SiteView by reading the store, and only *falls back* to the HTTP API, then to a
committed fixture. Two faults compounded:

- **`pnpm dev` fell straight to the fixture.** `astro dev` runs with no `DB_PATH`,
  so the direct read was skipped — and there was no dev default for `API_URL`, so
  the HTTP fallback was skipped too, landing on the fixture every time. `loadSite`
  now defaults the HTTP fallback to the server's dev port (`http://localhost:8787`)
  when nothing else is set; production still sets `API_URL` explicitly, so this
  only bites in dev.
- **The fixture was missing those exact three modules.** `fallback-site.json`
  defined `hero … contact` but not `presence`, `playtime`, or `music`, so even a
  correct fallback dropped them. They're added now (generated from a resolve over an
  empty store, so each matches its module's real shape), and the fixture's `/life`
  nav places them, matching the live IA. So the degraded path renders the right
  page structure instead of silently skipping modules.

### Build — Dockerfiles rebuilt around `pnpm fetch` + prune-to-`/prod`

Both images (`apps/server`, `apps/web`) rebuilt as multi-stage: a lockfile-only
`pnpm fetch` layer (cached until `pnpm-lock.yaml` changes, so source edits never
re-download), an offline `--frozen-lockfile` install, the workspace build in
dependency order, then `pnpm --prod deploy --legacy /prod` to a self-contained,
dev-dependency-free runtime tree. The web build keeps the `core → db → web` order
the SSR direct-read requires (`@lg/db` built before Vite resolves it). A new root
`.dockerignore` keeps the build context small and blocks `.env`/secrets from being
baked in. Depends on the `files:` fields already present on each package (notably
`@lg/db` shipping `src/migrations`, so migrations reach both images). Supersedes the
earlier one-line Dockerfile fix below.

### Feature — Listening, a fortnight of Spotify

A new `music` module on `/life`, sibling to `playtime`: where that asks "when and
how much do I play", this asks "what have I been listening to". Same "accumulated
past" shape — top lists plus a clickable per-day strip — but driven by
`music_plays` (the Discord Spotify presence the sampler already records) instead of
Steam counters.

The interaction earns the module its own component rather than reusing playtime's.
The three headline stats **double as the navigation**: "tracks played" reveals the
top songs, "different artists" the top artists — one content region taking turns,
driven by what you click. "time listening" isn't clickable; there's no list behind
a duration. The timeline below drills in the same way playtime's ledger does —
clicking a day fetches that day's tracks on demand (`GET /api/music/day`) rather
than shipping fourteen days of breakdowns up front. Each list caps at five with a
show-more toggle, the same control the activity feed uses.

- **Album art**, served through the existing `/api/presence/media` proxy — the same
  path the game icons take, and `i.scdn.co` was already on its allow-list. A new
  `spotifyAlbumArtUrl` in `@lg/core` derives the cover from the Spotify activity's
  `assets.large_image` (`spotify:<id>` → the CDN URL); the sampler captures it into
  a new nullable `music_plays.album_art_url` column (migration `0006`). Nullable and
  backfilled via `COALESCE`: plays recorded before the column existed, and the odd
  art-less track, render a **lettered monogram** instead — the same fallback the
  proxy already does for games. No backfill migration; history degrades to monograms
  and new plays show covers.
- **Artists borrow a cover.** The presence exposes album art, not artist images, so
  an artist row shows the art of that artist's single **most-listened** track (a
  correlated subquery ordering by summed duration). Every row gets a thumbnail
  without inventing an image the data doesn't have.
- **The stats are distinct counts, not play sums.** `distinctTracks` counts tracks
  (a song replayed is one track); `distinctArtists` counts the split artist keys, so
  a collaboration's members each count once and Charli xcx's solo and featured plays
  merge.

**Honest about what Discord's Spotify presence can't tell us.** Genre and
podcast-vs-music aren't in the payload — they'd need the Spotify Web API — so the
module doesn't pretend to them: no genre breakdown, no "music vs podcasts" split.
The types carry no columns for data that doesn't exist.

**Touch points**, all mirroring playtime so the pattern stays one pattern: the
`music` kind in `MODULE_KIND`, a `MusicModuleView` variant on `ResolvedModule`, the
resolver's `case "music"` (empty-safe — a fresh install with no plays is an empty
module, not an error), `buildMusicHistory` pre-computing the window server-side, the
IA descriptor placed after `playtime` on `/life`, and the CMS layout editor mapping
`music → presence` (it shares the presence sampler's settings, as playtime does).
Sixteen repo tests and a resolver test, each proven to bite by mutation.

### Fix — the web image built without `@lg/db`

Collapsing the playtime/music day-fetch onto a direct store read (above, and in the
boundary rework) made `apps/web` import `@lg/db`, whose `package.json` resolves to
`./dist/index.js`. But `apps/web/Dockerfile` built only `@lg/core → @lg/web`, so at
`astro build` time `@lg/db`'s `dist` didn't exist and Vite's resolver failed with
`Failed to resolve entry for package "@lg/db"` — breaking `docker compose --profile
web up --build`. The Dockerfile now builds `@lg/core → @lg/db → @lg/web`, matching
the server image's `core → db → sources → server` order. `@lg/db` already declares
`files: ["dist", "src/migrations"]` and is a listed web dependency, so `pnpm deploy`
carries it; only the build order was wrong.

### Boundary rework — the things that were asserted get checked

Four habits, each replicated across the tree, each producing live bugs. A
vocabulary authored as a union instead of derived from a list, so every consumer
that needed the list at runtime wrote its own. An API boundary with no contract,
so each shape was written three times and agreed with itself by luck. Functions
shaped by the button that called them instead of the operation they perform. And
prose asserting facts about the code that nothing verified — despite `lint:nav`,
`lint:tokens` and `storage-keys.test.ts` already being the cure, used three times.

**Bugs this surfaced, in the order they were found.**

- **The hero's primary CTA pointed nowhere.** The seed writes `href: "#contact"`;
  `HREF_PATTERN` allowed `https?://`, `mailto:` and `/` but not `#`, so `safeHref`
  flattened it to `"#"`. `HeroSection` then intercepted the click and passed
  `"#".slice(1)` — an empty string — to `goAnchor`, which asked the nav for `""`.
  The pattern guards against `javascript:`/`data:` script sinks; a fragment has no
  scheme. `#` was excluded by accident, and the click handler hid the result.
- **Reordering a list wrote two rows.** `move(arr, i, dir)` swapped neighbours and
  PUT both, so moving item 0 to the end left the other eight with stale `sort` —
  which `ORDER BY sort, id` then settles by id, an order nobody chose.
- **The dashboard counted the dashboard.** `isPageView` excluded assets and
  `?preview=1` but not `/admin`, so opening the editor logged two page views (the
  panel, and the canvas iframe). Of six recorded "visits", five were the owner and
  one was a `curl` — which `parseUserAgent` resolved to `Other`/`Other`/`desktop`
  and counted in every card.
- **`(await cms.uploadAsset(file)) as PostAsset`** claimed the server returns a
  slug. It doesn't — the next line was `updateAsset(created.id, { slug })`,
  disproving the cast one statement later. It compiled, built and shipped.
- **`asText(r.kind) as AssetKind`** took the store's word about a bare `TEXT`
  column, and **`q.kind as AssetKind`** took a query string's.

**Vocabularies are values; types derive from them.**

- `AssetKind` was a bare union — no runtime list, so every boundary that needed to
  *check* one asserted instead. Now `ASSET_KINDS` + `isAssetKind`, with
  `FALLBACK_ASSET_KIND` for rows the vocabulary doesn't recognise. `isTone` and
  `isPresenceCategory` join it; those lists already existed and never got a
  predicate. **The vocabularies that had a predicate (`ModuleKind`, `SourceId`,
  `Locale`, `Theme`) are exactly the ones never cast anywhere.**
- `AnalyticsDimension` was a second union in `@lg/db` listing all sixteen members
  including every one of core's `ENGAGEMENT_DIMENSIONS`, in a different order. Now
  `LOG_DIMENSIONS + ENGAGEMENT_DIMENSIONS`, derived in core.
- `TONES` had five copies. The fifth was `HobbiesPanel`'s hardcoded
  `<option>purple</option>…` — the dropdown that decides what you can pick. The
  sixth-in-waiting is `tone TEXT NOT NULL, -- 'purple' | 'coral' | …`: SQLite can't
  `ADD CONSTRAINT` and a `CHECK` would be another copy, so a test asserts the
  comment lists exactly `TONES`, as `storage-keys.test.ts` does for the inline
  script.
- `areaHref`/`targetHref` moved to `@lg/core`. They're resolution rules, and while
  they lived in `apps/web/src/lib` the resolver had no way to turn `#contact` into
  a URL — so it threw it away.

**The API boundary has a contract.** `handle()` returned `res.json()` — `any` — so
all 24 client methods returned `any` and each endpoint's shape was written three
times: JSON Schema (requests), a TS interface (the entity, not the envelope), and a
cast at the call site. `packages/core/src/api.ts` is the missing description; both
ends import it and **the server's routes are typed to return it**, so a route that
drifts fails the server's typecheck. **API-boundary casts 8 → 0; string-to-domain
casts 6 → 0; zero `any` in `useCms.ts`.** Half the casts turned out to be
redundant — `classifyAsset` already returns `AssetKind | null`, `readPresence`
already sanitizes — which is worse than wrong: a redundant cast reads like a
checkpoint.

**Content has a history.** `0001` archives every sync forever because "history
can't be re-fetched", then stored everything the owner writes in one row under
`CHECK (id = 1)` and UPDATEd it in place. GitHub would hand its data back tomorrow;
a rewritten bio existed nowhere else — and the CMS saves on blur, so that was every
edit. `0002_content_revisions.sql` is the pair `0001` already uses, applied to the
owner: `site_content_revisions` is to `site_content` what `source_snapshots` is to
`source_current`. All thirteen CMS-owned writes route through one `write(reason, fn)`
seam that archives inside the caller's transaction — structurally, there is no path
that writes content without archiving it. Restore writes forward and is itself
archived; scalars only, returning `listsDiffer` rather than half-replaying the list
tables silently.

**Operations are named for what they do, not for the button.** `moveModule` swapped
neighbours; `setModuleArea` appended; `moveGallery` PUT two rows and only worked on
adjacent items. None could express a drag. One primitive — `moveModuleTo(fromList,
fromIdx, toList, toIdx)` — now backs ↑/↓, the area dropdown and drag alike, with
`PUT /api/cms/gallery-order` renumbering a whole gallery in one transaction.
`useEntityList<T>` is the client's mirror of the server's `registerCrud<T>`: typed
(the old helpers took `any[]`), and `moveTo(from, to)` rather than `move(i, dir)`.

**Drag and drop, and a visual editor.** `sortablejs` (MIT, 0 deps, 45KB) lands only
in the `/admin` chunk. The keyboard path stays — a11y floor. The editor canvas
renders the site's **real** section components: `Layout.astro` already loads
`app.css` on every page including `/admin`, and `SitePanels` already takes a whole
`SiteView`. It's a separate document (`/admin/canvas`) for two reasons that agree:
`cms.css`'s `.cms .card` (0,2,0) would out-specify `app.css`'s `.card` (0,1,0), so a
canvas inside the admin would show you admin styling and you'd believe it; and a
prerendered, data-less document ships nothing to an unauthenticated visitor.
`POST /api/cms/preview` resolves the pending order and writes nothing, sharing
`applyLayoutOrder` with the save so the canvas can't show a layout Save then
refuses. It deliberately doesn't lint: mid-drag an area is legitimately empty.

**Analytics counts people.** `/admin` is no longer the site. `agent.ts` classifies
self-identifying non-humans into six coarse families, counted as `dimension: "bot"`
and kept out of `path`/`browser`/`os`/`device`. The rule — separate *a* human from
*not a* human, never one human from another — makes "a request with no interaction
is a crawler" un-implementable as stated: correlating a log line with a beacon needs
a shared identifier, which is the thing being avoided. So no join, two counts: page
views are the **ceiling** (a request claimed to be a browser), confirmed visits the
**floor** (a browser actually ran JS — `initTracking` already sent this on every
load; it was mislabelled "Section views"). Tested as a property: two people on the
same page produce byte-identical hits.

**The editor, after someone actually opened it.** Seven reports, five causes.

- **The wrong item got dragged.** The canvas mapped `.panel`'s Nth child to the Nth
  module. Thirteen sections render one root; `HeroSection` was a fragment of five,
  so from the hero down every handle sat on a different section than the one it
  outlined. Position was never the key: every section now carries
  `:id="module.id"` and the canvas finds each module by id. `ContactSection`'s
  hardcoded `id="contact"` — a second spelling of the module id — is gone with it,
  which is also why `#contact` was the only deep link that had ever worked.
  `SitePanels` scrolls with `getElementById(moduleId)`; nothing else had one.
- **"Shows you where it will land and then does nothing."** `dragover` set no
  `dropEffect`, so it mismatched `effectAllowed` and the browser rejected the drop
  *after* drawing the indicator.
- **Navigating inside the editor killed it.** The canvas's links are real — that's
  the point — so clicking one took the iframe to the actual page, which has no
  canvas in it. Clicks on `a[href]` are now trapped at capture; an in-page anchor
  still scrolls.
- **Nothing looked draggable.** Every affordance was hidden behind `:hover` on the
  module, so the only way to find a handle was to sweep the page. Handles are an
  editor's interface, not a reveal: faint at rest, solid on approach, and a real
  target rather than `⠿` at 13px.
- **Desktop preview was narrower than Tablet.** `grid-template-columns: 1fr 240px`
  — `1fr` is `minmax(auto, 1fr)`, and `auto` floors a track at its content, so the
  820px tablet canvas widened its own column while "Desktop" took what was left.
  `minmax(0, 1fr)`.
- **The guestbook and the presence widget rendered unstyled.** `client:only` means
  Astro never renders the component at build, so it can't walk the tree and never
  emitted the stylesheet for what's inside — the site's scoped component CSS
  (`ContactForm`, `GuestbookForm`, `PresenceWidget`, `BaseForm`; ~16KB) shipped in a
  chunk the canvas page never linked. `client:load` fixes it and changes no data:
  the shell renders "Waiting for the editor…" either way, and got *smaller*
  (8.3KB → 6.8KB) because the empty state is now server-rendered rather than
  bootstrapped.

`tests/components/module-anchors.test.ts` locks the invariant both the canvas and
deep links depend on and neither stated: **one element per module, carrying its
id**. A fragment or a missing `:id` fails it.

**And then the iframe went.** Asked whether it was the right approach, its three
justifications were re-checked and one survived.

- *"It ships no data to a non-admin"* — **confused**. `/admin` is already a 6.7KB
  data-less shell. The requirement was "don't put edit mode on the public site";
  a component behind the same auth meets it identically. A real requirement had been
  quietly upgraded into an architecture nobody asked for.
- *"`.cms .card` (0,2,0) out-specifies `.card` (0,1,0)"* — true, and **dissolvable**.
  `cms.css` defines 7 selectors outside its namespace, `app.css` defines none of
  them, and there are no bare element rules — so `<Teleport to="body">` buys the
  same isolation as a document boundary, in one line.
- *Device-width previews* — the only irreducible one (an iframe has its own
  viewport, so media queries fire at its width). Dropped: devtools does it better,
  and full-screen is an honest desktop width rather than a 660px column labelled
  "Desktop".

Deleted: `canvas-protocol.ts` (110 lines), `/admin/canvas` and its build entry, the
`canvas:ready` handshake, origin and shape checks, ~31 postMessage call sites — and
with them two bug classes that only exist across a document boundary, both of which
had already bitten: `DataCloneError` (postMessage can't clone a Vue proxy) and the
16KB of CSS a `client:only` entry can't be traced for at build. `useCms.ts` 1282 →
1219. The site's rendered HTML is byte-identical.

The tests went with the boundary rather than outliving it as decoration: a
`structuredClone` regression and a handshake test were tests *of postMessage*, not
of the editor.

**A verification note, because it's the same bug.** The gate used to be run as
`pnpm typecheck | grep -cE "error TS"`. `astro check` reports `error ts(2322)` —
lowercase — so that filter could not match an astro check error, ever. Every
"0 typecheck errors" it produced was a check that couldn't fail, which is the exact
shape of the `as PostAsset` cast and the unenforced `tone` comment this entry is
about. `pnpm typecheck` already returns a verdict as an exit code; grepping its
output was a second copy of the rule that disagreed with the first. It caught four
dead declarations once read properly: `canvasReady` (left behind when the iframe
went — its comment cited the deleted `canvas-protocol`), an unused
`MODERATION_ACTION` import, an unused `ModuleKind` in a test, and an `await` on a
synchronous function.

**The editor after opening it a second time.** The canvas rendered with no
background at all — you could read the CMS's sidebar through it — and the rail was
unstyled. Both from one line: `<Teleport to="body">`.

`.cms` carries three things, and the teleport threw out all three to escape one.
The token layer (**34 custom properties**, `--bg-base`, `--card`, `--line`, `--ink`
…) is defined on `.cms`, so outside it every `var()` in the editor resolved to
nothing and `background: var(--bg-base)` was invalid — hence transparent. The rail
is built from `.cms .modlist` / `.cms .grip`, which stopped matching for the same
reason. Only `.cms .card` and `.cms .btn` were ever in the way, and only for the
canvas. That's `:not(.lgedit-page *)` on four rules, and the editor stays inside
`.cms` where its variables live — `position: fixed` covers the screen from there
regardless, since `.cms` sets no transform, filter or containment.

`.cms .editor` was also defined twice — CmsApp's panel column and the editor's
launcher, one class name, two components, one stylesheet. Gone with the dock.

**`/admin` was `client:only` too, and for a reason that wasn't true.** The comment
said it kept private content out of SSR. There is no private content at build time
— `CmsApp` renders "Loading…" until a token fetch returns, and that's what SSR
emits either way. What it actually did was stop Astro walking the component tree,
so the site's scoped styles (ContactForm, GuestbookForm, PresenceWidget, BaseForm)
never reached the page: **the guestbook and presence widget rendered naked inside
the editor because of one word.** Same bug as the deleted canvas page had, same fix,
`client:load`.

**The editor absorbed Layout, Preview, and content.**

- **Clicking a module edits it, in the rail.** It used to `pick(panel)` — switch the
  CMS's tab *behind* the full-screen editor — so the only thing selecting a module
  did was leave the editor. You could arrange a page or write its words, never both.
  The rail now renders that module's own panel component, unchanged, beside the page
  it changes. Synced modules say so instead of opening an empty form.
- **`Layout` is gone.** The editor's rail already listed every area and every
  unplaced module, and dropping onto it already moved things. Two screens for one
  job.
- **`Preview` and the docked preview iframe are gone.** The editor *is* a preview,
  and a better one: it renders the *pending* layout at the full viewport, where the
  dock rendered the *saved* one in a 660px column. `showDock`, `previewKey`,
  `previewSrc`, `.worksplit`, `.dock*` — 44 lines of CSS and a whole iframe.

`VIEWS` also moved out of `useCms()` to module scope, which is where a constant
belongs: the function is 1200 lines, so a type declared in it can't be exported and
a panel that wants to name a `View` couldn't have one.

**Playtime for games Steam has never heard of.** The "Right now" chart was Steam's
`minutes2Weeks` and nothing else, so anything not launched through Steam was
invisible — not undercounted, absent. Discord already knows what's running; nothing
was writing it down.

**A sampler is not a source, and that distinction is the whole design.**
`Source.ttl`'s own comment rules presence out in one line — "Discord presence is
worthless after a minute" — which is why Lanyard was never registered as one and why
`/api/presence` fetches live. A source pulls a complete state its adapter can pull
again tomorrow: the newest snapshot is the truth and a missed sync costs nothing. A
sample is a *moment*, and nobody can hand one back — a poll that doesn't happen is
playtime that never existed, and the truth is the accumulation rather than the
newest row. That's the shape of `analytics_hits`, not `source_current`, and
`presence_sessions` (`0003`) sits with it.

It also can't live in `/api/presence`, where the Lanyard fetch already is, which is
what makes it look free: accumulating in the request path would make playtime a
measure of the site's traffic. Nobody visits at 3am, so nothing was played at 3am.

**Sessions, not samples.** A row per poll times the interval is ±5 minutes of error
at each end of every session. Discord answers better: `timestamps.start` dates the
activity, so a poll says "playing X, *since S*". `(category, name, started_at)` is
the session's identity and a poll only moves `last_seen_at` — the sampler is
**idempotent by the primary key**, so polling twice, retrying, or overlapping runs
cannot inflate a total. Duration is `last_seen - started`; the only error left is the
tail before quitting, bounded by the interval, always an under-count, never
compounding.

**Steam and Discord are not two numbers to add.** Discord reports Steam games too,
so summing double-counts every hour Steam already knows about. Nor is it `max()` —
that's still a guess about which measurement you're holding. Steam's fortnight
counts hours Discord was closed, so it wins where it has an answer; observed minutes
fill in everywhere else, which is the only place a non-Steam game was ever coming
from. Every entry carries its `source`, and Steam's `appId`/icon/accent travel with
it — so a Steam tile is still a store link and an observed one renders as a `<div>`,
because Discord gives a name and nothing to link to. Verified against the running
stack: Counter-Strike 2 appears **once** (620 Steam minutes, not 620 + 200 observed),
Minecraft appears at all.

**A bug this found in itself.** Discord doesn't date every activity, and the undated
path used `started_at = now` — which made *every poll its own zero-length session*,
so an undated game accumulated nothing, forever, silently, because
`PLAYTIME_MIN_SECONDS` dropped each row. Found by mutating the idempotence test and
noticing it failed somewhere other than expected. Undated polls now extend whatever
session is still open (`PRESENCE_SESSION_GAP_MS` — twice the interval, so one failed
poll doesn't saw a session in half), and `started_exact` marks the total as the floor
it is.

**Spotify listens now record the artist, not "Spotify".** The sampler keyed music
sessions on `activity.name` — which Discord sets to the literal string "Spotify"
for every listen — so "top artists" would have been one bar labelled Spotify. The
artist rides in `activity.state` (the song is in `details`); a new `sessionSubject`
function reads the right field per category, and "top artists" now falls straight
out of the same `SUM(duration) GROUP BY name` the games use. The music *module* is
held until there's a place for it, but the data it needs is accumulating correctly
from now on rather than being silently thrown away.

**Two historical playtime features, both from data already on disk.**

*Feature 03 — when I play.* A weekday×hour heatmap, the same `.heat` component as
the contribution graph, so "when do I play" reads the way "did he commit today"
does. Pure SQL over `started_at` — no new sampling, the rows were already there.
Neutral tiers, only the current hour purple.

*Feature 02 — the all-time ledger.* Exact minutes per day, and this is where the
`playtime_forever` work pays off. The Steam adapter fetched `GetRecentlyPlayedGames`
and dropped that field — it wasn't even in the type. Now it flows through to
`SteamData`, gets archived in every `source_snapshots` row like the rest, and
`differenceLedger` differences consecutive snapshots into exact per-day minutes.
`playtime_2weeks` couldn't do this: it decays (played minus expired), so its delta
isn't playtime. `playtime_forever` is monotonic, so its delta is. `source.history`
— written for "the raw material for long-range trends" and until now called only by
a test — is finally the caller it was built for.

The differ has three cases that each cost a test proven to bite: a game's **first
sighting** seeds its baseline and credits nothing (else Counter-Strike's 74,000
lifetime minutes would land on day one), a **backwards counter** is noise clamped to
zero and re-baselined, and a delta is attributed to the **newer** snapshot's day.

The ledger strip is navigable, as asked: clicking a column fetches that day's
breakdown (`/api/playtime/day`, games-only, date-validated) and pins it against the
all-time figures, so a day is always read against the whole. A day with no play is a
real answer — "Nothing recorded this day" — not a blank.

Both live in a new `playtime` `ModuleKind` with its resolver, view, component, and
CMS wiring — but it is **not placed in the nav yet**, by request. It exists and is
placeable; where it goes is a later decision. Its CMS panel points at the existing
presence panel, because the category allow-list that decides what the sampler
records is the same setting — a second panel would be a second set of knobs for one
set of settings.

Retention/pruning (mockup 05) is deliberately *not* in this change: the two features
work without it, and a new column plus a scheduled prune is a separate concern worth
its own tranche rather than folding in silently. `sessions.prune()` still exists,
still uncalled.

**The CMS management layer for playtime — and a correctness fix it exposed.**

The sampler recorded *every* category regardless of the presence allow-list, so
disabling "music" hid it from the live widget while the database kept filling. That
was always two questions written as one setting. Now `PresenceSettings` has two
independent axes: `show` (what the live widget reveals — unchanged) and `sample`
(what the sampler writes). A category can be recorded-but-hidden or shown-but-not-
recorded; neither implies the other. The sampler reads the record list per poll, so
a toggle takes effect without a restart.

`0004` adds three nullable columns (`sample`, `retention_days`, `hidden_games`), so
the pre-migration row reads cleanly — a NULL `sample` falls back to "record what you
show", the behaviour that row was created under, which is why there's no data
migration.

Three controls, the three the mockup drew:

- **Record to history** — the `sample` axis above. Steam is excluded: its history
  comes from its own sync, not the sampler.
- **Retention** — forever (default) / 2 years / 1 year, constrained to that set so a
  fat-fingered `1` can't prune the table. A daily sweep at 03:17 calls the
  `sessions.prune()` that had been sitting uncalled since it was written; retention
  is read per-run, so changing it doesn't need a restart.
- **Hidden games** — recorded like everything else, never *named* on the public
  page. Dropped from the recently-played chart and the day-breakdown (the two places
  a game's name surfaces); the aggregate ledger and heatmap stay honest totals,
  because they're shape, not identity. Matched case-insensitively, so "doom" hides
  "DOOM".

Every field sanitizes from untrusted input with a per-field fallback to its default,
so a client that sends only `show` (older UI) still writes a valid row. The sampler's
allow-list gate, the retention read, and the hidden-games filter each cost a test
proven to bite by reverting it.

**Not done, and named as such:** `streaming` and `watching` still record the app,
not the subject — nothing reads them, and neither has a clean structured field like
Spotify's `state`. The `playtime` module is still unplaced in the nav, and the
`music` module still held, both awaiting your call.

**Music data collection for a Wrapped-style view — and the payload settled what
Lanyard can actually give.**

A real Lanyard payload made the model concrete. A Spotify listen carries the song
(`details`), the album (`assets.large_text`), the track id (`sync_id`), and the
artist in `state` — but as `"Icona Pop; Charli xcx"`, *multiple* artists joined
with "; ". My earlier fix keyed music sessions on that whole string, so "top
artists" would have shown the collaboration as one artist and never merged Charli
XCX's solo plays with her features.

So music gets its own shape. `presence_sessions` has one `name` column because a
game is one subject; a track is three (song, artist, album), and cramming them into
one name makes two unrecoverable. `0005` adds `music_plays` (keyed `(track_id,
started_at)` — idempotent, one scrobble per song no matter how many polls catch it)
and `music_play_artists` (one row per collaborator, so a feature counts toward each
artist, grouped case-insensitively so "xcx" and "XCX" are one). The sampler routes
music there and everything else stays a session; `sessionSubject` no longer handles
music at all.

That gives the data behind top songs, top artists, top albums, and a listening
timeline — the same shape as the playtime ledger. Verified against the exact
payload: "I Love It (feat. Charli XCX)" lands once, "Icona Pop; Charli xcx" splits
into two rankable artists, "THIS IS... ICONA POP" is the album.

**What Lanyard can't give, stated plainly:** genre and podcast-vs-music. Discord's
Spotify presence exposes neither — a podcast episode arrives as a type-2 activity
indistinguishable from a track. Both would need the Spotify Web API (OAuth, refresh,
rate limits), a separate source. No empty columns pretending that data is coming.

**The playtime module is placed.** On `/life`, right after "Right now" — present
tense flows into history. Verified rendering live alongside presence.

**The `go` prop-hack is gone (roadmap b).** Two "see all" buttons called
`window.location.assign()` via a `go` prop threaded through `SitePanels` → `Module`
→ section — a JS-only navigation with no middle-click, no crawlability. The resolver
now computes a `moreHref` (the same `targetHref` the hero's links use) and the
buttons are real `<a href="/code">` anchors. The `go` function, its prop chain, and
the now-unused `areaHref` import are deleted. Verified: the rendered button is an
anchor, zero `href="#"` on the page.

**The SSR HTTP hop is gone — the web app reads the store directly.**

`loadSite()` ran `fetch(${API_URL}/api/site)` on every server render: a network
round-trip to a second process on the same box, reading the same SQLite file, to
produce a page. It now opens the store **read-only** and builds the view in-process
with the same `buildSiteView` the API uses. An SSR render is a local read.

The safety turns on read-only. The API is the writer — migrations, seed, sync, CMS
edits — and a second process opening the same file to *write* would race it. A
read-only handle (`openStoreReadonly`, `readOnly: true`) makes that impossible at
the SQLite level: it physically cannot write, so there's nothing to race, verified
by watching a write attempt throw "attempt to write a readonly database". WAL means
the reader still sees the writer's committed changes without blocking it, so SSR
stays live as the sync worker updates the store.

`buildSiteView` and `buildAssetLookup` moved into `@lg/db` (which already depends on
core and is the data layer), taking plain options instead of a server env, so both
the API and the web app compose the identical view — the duplicate in `apps/server`
is deleted. One resolver, not two that drift.

The sharp edge was the client bundle. Three `.vue` components import `mdBold` from
`site.ts`; adding a `@lg/db` import there would have dragged node:sqlite into the
browser. `mdBold` and `pickLocale` moved to a new client-safe `text.ts`, so `site.ts`
is imported only by `.astro` (SSR) files now. Confirmed against the built output: no
`DatabaseSync`/node:sqlite/`buildSiteView` in any client `.js`, correctly present in
the server bundle.

Deployment: web mounts the store volume `:ro` and gets `DB_PATH`/`MEDIA_DIR`.
`API_URL` stays as a fallback (a container where the file isn't reachable falls back
to HTTP, then to the committed fixture — a page always renders), and the browser
still reaches the API cross-origin for presence/CMS/media, unchanged. Verified live:
web renders `/` and `/life` with `API_URL` unset entirely, reading the store
directly, real content not the fixture.

**Scoped section styles — the pattern, proven on Gallery (roadmap d, begun).**

The 14 section components draw their styles from the 1200-line global `app.css`,
which is what created the specificity war the (now-deleted) editor iframe once
existed to escape. `app.css` mixes shared primitives (`.sec`, `.card`, `.grid` —
every section uses them) with section-specific rules (`.gal`, `.gb-entry`, `.ev` —
one section each). The extraction moves only the section-specific rules into
`<style scoped>`, leaving the shared primitives global.

Gallery goes first, as the reference. Its `.gal*` rules moved into the component;
the shared `.sec`/`.sub` stayed global. The one gotcha this surfaced — and the
reason the other 12 need the same care rather than a blind move — is that scoped
styles do not reach into child components: `.gal-item img` had to become
`.gal-item :deep(img)` because the `<img>` is rendered by `AssetPicture`, a child.
Verified in the built CSS: the rules are scoped (`.gal[data-v-…]`), the deep
selector compiled through to the child image, and the gate is green. (The stale
`go` prop left on this section from before the moreHref fix is gone too.)

**Scoped section styles, finished — all 14 sections (roadmap d).**

The remaining 12 sections joined Gallery and Playtime: section-specific rules moved
into each component's `<style scoped>`, shared primitives (`.sec`, `.card`, `.grid`,
`.btn`, `.bar`, `.stat`, `.heat`, feed/dash rows) left global. `app.css` went from
1202 lines to 861. The specificity war that the deleted editor iframe once existed
to escape is structurally over — a section's styles can no longer be out-specified
or leak, because they carry a scope attribute.

The extraction was per-section and careful because scoped styles have two traps
that a blind move would hit silently. Scoped CSS does not reach into child
components, so any rule targeting an element a child renders needs `:deep()` —
`.gal-item img`, `.bio-img img`, and `.avatar img` all target images inside
`AssetPicture`, and `.tile .ic svg` / `.ev .ei svg` target icons the icon helper
injects. And `v-html` content is never stamped with the scope attribute, so
`.prose p`, `.prose b`, `.lede b`, and `.nowrow .v b` — all styling v-html'd markup
— became `:deep()` too. 24 such selectors, all verified compiled in the built CSS.
Five sections (Coding, Contact, Presence, Featured, Projects) needed no scoped block
at all: every class they use is a genuinely shared primitive. Two dead rules
surfaced and were dropped (`.glance-stats`, a stale `/* prose */` marker), and the
`go` prop left on several sections from before the moreHref fix is now gone
everywhere. Verified live: every area renders, scope attributes present, shared
primitives still shared.

**Splitting `useCms` — begun, two slices out (roadmap c).**

The 1264-line CMS composable started to come apart along its natural seams. Presence
settings (`usePresenceSettings`) and guestbook moderation (`useGuestbookMod`) are now
their own files — each a cohesive group that only needs the shared write helpers
(`guarded`, `cms`) and, for guestbook, the auth flag passed in. `useCms` calls them
and spreads the result into its return, so the panels that `inject()` the context
see exactly the same members: this changes where the code lives, not how it's
consumed. Verified live: the CMS content endpoint loads and a presence save
round-trips (`hidden_games`, `retention_days` persist) with the extracted composables
in place.

The larger remaining blocks — analytics (with its visibility-based poll lifecycle
tied to the tab watcher) and the gallery/canvas state (deeply shared) — are left for
a dedicated pass rather than rushed here, because a subtle mistake in the poll wiring
would break the live dashboard silently.

**Splitting `useCms`, continued — analytics out, and the poll lifecycle came with
it (roadmap c).**

The analytics dashboard was the biggest and most tangled block in `useCms`, and the
one with real lifecycle: a poll that runs only while the analytics panel is open
*and* the tab is in front, wired through a `tab` watcher, a `visibilitychange`
listener, and the mount/unmount hooks. All of that now lives in `useAnalytics` — the
composable registers its own `onMounted`/`onUnmounted` and `watch`, so the parent no
longer threads the poll through its lifecycle. `useCms` went from 1264 lines to 939;
the three extracted slices (`usePresenceSettings`, `useGuestbookMod`, `useAnalytics`)
are 96, 60, and 347 lines.

The extraction also traded a `ref<any>` for the real `AnalyticsResponse` type from
core, so the panel is now type-checked against the actual response shape instead of
`any` — the chart geometry and the metric totals get proper types.

The reason this was safe to do in one pass, despite the lifecycle risk: the existing
`useCms` test suite already covers the poll behaviour thoroughly — it asserts that
opening the panel polls, leaving it stops, a backgrounded tab doesn't poll, a 401
stops the loop instead of hammering it, and a read never invalidates the preview.
All of those pass **unchanged** after the extraction, which is a stronger proof that
behaviour was preserved than any manual check: the tests exercise the poll through
`useCms`'s public surface, so they validate the new wiring end-to-end. 59 web tests
green, and the admin page mounts live with no SSR errors.

Consumption is unchanged throughout — `useCms` spreads each composable into its
return, so every panel that `inject()`s the context sees the same members it always
did. What's left of the monolith is the gallery/canvas state, which is genuinely
interwoven with the layout editor and is the honest next slice.

**`useCms` split finished — the layout/gallery/canvas tangle is out (roadmap c
complete).**

The last and most coupled slice: layout, gallery, and the editor canvas all read
and write the same placement state — which modules exist, how they're ordered per
area, which are unplaced, and the gallery image rows — so they came out together as
`useLayoutEditor` rather than as three composables fighting over one set of refs.
The visual editor rearranges the same lists the ↑/↓ buttons and the area dropdown
do, through one `moveModuleTo` primitive; the gallery editor is a second view onto
the same rows. That shared state, and every operation that touches it, now lives in
one place. `useCms` hydrates it from the content it loads (`hydrateLayout`) and
spreads the result into its return, so panels see the same members.

With this, `useCms` is 635 lines — down from 1264 at the start, a 50% cut — split
into four focused composables: `usePresenceSettings` (96), `useGuestbookMod` (60),
`useAnalytics` (347), and `useLayoutEditor` (445). Sixteen now-dead imports and an
orphaned type were swept out of `useCms` in the process.

The safety story is the same one that made the earlier slices safe, and it's the
reason a tangle this size could move in one pass: the existing test suite already
covers the layout operations thoroughly — reorder within an area, move between
areas, hide/show, drop, and the keyboard ↑/↓ — and all of it passes **unchanged**
after the extraction. The tests drive those operations through `useCms`'s public
surface, so passing unchanged is direct evidence the behaviour is intact, stronger
than any manual pass. 59 web tests green; live, every surface (home, /life, /code,
/about, /admin) renders and the CMS content/layout/preview endpoints all answer, so
the drag-drop, the gallery, and the canvas preview work against a real store.

A couple of type edges got tightened rather than papered over on the way: the canvas
now carries the real `AnalyticsResponse` and `Asset` types from core instead of the
`any`/loose shapes the monolith had leaned on.

**Removed.**

- `goAnchor` from all fourteen sections — **eleven declared it and never used it**,
  taking it only because `Module.vue` handed it to everyone. `goToAnchor` deleted
  with them. `go` survives in two sections pending a resolved `moreHref`.
- `targetArea`; the `any[]` `move`/`delItem` helpers; `LIVE_CATEGORIES` in
  `presence.ts` (core already derived it); `OWN_HOST` and `LOCAL_DIR_EXPLICIT` from
  the ingest script.

**Also.** `robots.txt` disallowing `/admin` (there wasn't one, and the admin now has
two routes). CMS tab persisted in the URL hash — bookmarkable, survives reload, two
tabs don't fight; not a walk-back of "areas are routes", which is about the site.
Analytics polls every 30s only while its panel is open and the document is visible,
on its own read path — it previously ran through `guarded()`, which bumps
`previewKey` and reloaded the preview iframe every poll. `docs/operations/analytics-ingestion.md`
no longer hands out a copy-paste `pull-access-log.sh` with no `chmod`; the shipped
script asserts its own postcondition and its `.env` parser no longer mangles inline
comments into the path.


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
- **`docs/concepts/design-system.md`** carries the brief, the three rules and the
  gate. The original finding was never purple — it was that nothing had been
  re-decided since the prototype, and this is what notices next time. (The
  agent-facing copy lives in `.skills/`, which is gitignored: it's personal
  tooling, and `docs/**` is published.)

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
