---
approved: 2026-11-19T21:00:12.825Z
session: 20ca671f-1318-45e9-888c-c08ea75e7cfc
status: active
---

<!-- Written by the save-plan hook. Record deviations below the plan. -->
# Plan: rebuild Home as the whole story (keep visitors, drop the AI tells)

## Context

The owner's live analytics show that Home is the page people actually see. Few go deeper. Today Home is five thin blocks (hero, Areas, At a glance, Featured, Guestbook). Most of the substance sits on Code and Life. The last critique (25/32) named two open problems on Home:

1. **No visible proof that the site is alive** (P1). The positioning in `apps/web/PRODUCT.md` is "it's alive", and nothing prominent on Home carries it.
2. **Default structure and remaining tells**: the big figure plus caption (Glance), ruled index rows (Areas), three keycap buttons in the hero, a lede with jargon.

Removing Glance and Areas without replacing them would hide facts from the one page that matters. So the plan moves every fact into something richer on Home. Nothing is dropped.

Owner decisions (2026-11-19):
- **Shape:** "One scroll, the whole story" (hero, a sentence from live data, work, a games and music wall, a latest-activity feed, guestbook).
- **Measure first:** yes, as a small first step, shipped before the layout change so a baseline builds.
- **Hero:** rewrite the lede and the buttons. All new wording goes through the human-writing-style skill (personal voice overlay). The owner confirms the wording.

## What the exploration found (and what it changes)

- **The premise is unverified in the repo.** There is no real Home behaviour data in the repo (the seed data is random). The metric that would test it, "share of visits that reached a second area" (`secondPageFigure`, `packages/core/src/engagement.ts:53-71`), is collected and returned by `GET` analytics (`apps/server/src/routes/analytics.ts:340-343`) but **never shown** in the CMS. Area transitions and exits are also returned and never rendered. The plan makes both visible.
- **The hero is invisible to section tracking.** The tracker only observes `section.module-section[id]` (`apps/web/src/lib/track.ts:53`). The hero renders `<section class="hero">`, so it has no seen, dwell or flow data.
- **Click keys are too coarse.** `hero-cta` covers every hero link, `teaser` every Areas row (`packages/core/src/engagement.ts:125-140`). Clicks carry no page.
- **Home already receives all the data.** `resolveSiteView` resolves every module in the whole nav (`resolve.ts:1053`), so Life, Code and About data is already in the `/` payload. `teaserViews` (`resolve.ts:524-597`) already reads `ResolveInput` directly. New Home modules do the same, so they do not depend on the owner's layout. Page weight does not grow.
- **IA is stored data.** `site_ia` holds the live layout. `seedIfEmpty` only seeds an empty database. `reconcileIa` (`packages/db/src/seed.ts:188-358`) runs on every API boot and has `retiredModules` (strips ids from leaves, drops descriptors), appends missing launch modules, and resorts a leaf into launch order. That is the safe migration path. Side effect to accept and tell the owner about: it resets a CMS-customized Home order to launch order.
- **Constraints** (`apps/web/DESIGN.md`, `lint-design.ts`): signal color means "now" only. Mono face only for synced numbers and timestamps. No eyebrow labels, middle dots, arrows on links. A layout family appears once per page. At most two `ModuleCard`. New section files start at 0 mono and 0 accent allowance. `lint:nav` needs every launch module placed and every placed module registered.

## Target Home

| # | Module | Form | Data (from `ResolveInput`) |
|---|---|---|---|
| 1 | `hero` | Headline, short lede, live status first, one primary link and two quiet text links (no keycap trio) | existing presence, `lastActivity`, links |
| 2 | `week` (new) | One sentence of real data with linked phrases | Wakapi 7 day hours and top language, 7 day game minutes (`playHistory.ledger`), latest GitHub event |
| 3 | `featured` | Image-led lead (already rebuilt) | unchanged |
| 4 | `playing` (new) | Cover tile wall of top games, then a typographic list of recent tracks | `playtime`, `gameMeta`, `musicHistory`, reuses `ArtTile`, `RankedRow variant="type"` |
| 5 | `recent` (new) | Dated feed, last 5 events with a date gutter | `github.events` merged with releases and PRs (same source as `activity`) |
| 6 | `guestbook` | Quote column and form (already rebuilt) | unchanged |

Retired from Home: `teasers` (Areas) and `glance` (At a glance). Every fact they carried now lives in `week`, `playing` or `recent`, and each links to its deeper page. Wrapped can be placed on Home by the owner in the CMS (it resolves to nothing outside its window, so there is no gap); no code needed.

Layout families on Home after the change: type block (hero), sentence, image lead plus grid (featured), tile wall (playing), dated feed (recent), quote column (guestbook). Six distinct families, each once. The big-figure-plus-caption pattern and the ruled index are gone.

## Copy drafts (owner confirms; written with the human-writing-style personal voice overlay)

Rules applied: first person, dry, short, only facts the data can back, no dashes, no padding, no marketing words. Anything the data cannot support is cut, for example "mostly TypeScript" (the top language share is 46 percent, not a majority) and "this week" for music (the music window is 14 days).

| Place | English | German |
|---|---|---|
| Hero headline (unchanged) | I build websites. After hours I tinker. | Ich baue Websites. Nach Feierabend bastle ich. |
| Hero lede (new, seed text, CMS paste needed) | I'm a full-time web developer in Germany. Outside work I build plant sensors, LED strips and a home lab. | Ich bin Webentwickler in Vollzeit. Nach der Arbeit baue ich Pflanzensensoren, LED-Streifen und ein Home Lab. |
| Hero status | existing strings, promoted to body size ("Right now: playing X", "Last played X 2d ago") | existing |
| Hero links | primary "See what I'm building" (unchanged), plus quiet text links "GitHub" and "Contact" | "Das baue ich gerade", "GitHub", "Kontakt" |
| `week` heading | This week | Diese Woche |
| `week` sentence | I coded for {hours} hours ({pct}% {language}) and played for {hours} hours. {latest event}, {age} ago. | Ich habe {hours} Stunden programmiert ({pct} % {language}) und {hours} Stunden gespielt. {latest event}, vor {age}. |
| `week` example | I coded for 28.3 hours (46% TypeScript) and played for 11.4. Pushed to plantcare-tracker, 2 days ago. | Ich habe 28,3 Stunden programmiert (46 % TypeScript) und 11,4 Stunden gespielt. Push nach plantcare-tracker, vor 2 T. |
| `playing` heading | Games and music | Spiele und Musik |
| `recent` heading | Latest on GitHub | Neu auf GitHub |

Behavior rules for the `week` sentence: each number is a link (hours of code to Code, hours played to Life, the event to its repo). A clause whose source has no data is dropped. A clause whose source is stale or failed is dropped and the module shows the existing freshness marker instead of presenting old numbers as current (DESIGN.md: every synced module shows its real state). If every clause drops, the module resolves to null. The German event text and age reuse the existing `eventText` and `relativeTime(..., locale)`. "1 hour" and "1 Stunde" use the existing `plural()`. No new copy beyond the rows above; if more is needed it gets the same skill pass.

## Steps

Each step ends with all gates green (`pnpm lint:nav`, `pnpm --filter web lint:tokens`, `pnpm --filter web lint:design`, `pnpm typecheck`, `pnpm test`, `pnpm build`) and one Conventional Commit to main. Subagents (Sonnet) only for components, with file ownership lists. I write the copy and the resolver myself.

**Step 0: Measure first (ship and deploy alone, let a baseline build for a few days)**
- `apps/web/src/lib/track.ts:53`: observe the hero too (`.hero[id]` in addition to `.module-section[id]`), keep the `module` key stable. Check `apps/web/tests` for the tracker.
- `packages/core/src/engagement.ts` `CLICK_ACTIONS`: split coarse keys. Add `hero-github`, `hero-contact` (keep `hero-cta` for the primary), `teaser-code`, `teaser-life`, `teaser-about` while Areas still exists (so the baseline covers the old Home), then `week-code`, `week-life`, `week-event`, `playing-more`, `recent-more` in Step 4. Update call sites (`HeroSection.vue:45`, `TeasersSection.vue:16`) and the server allow-list test.
- `apps/web/src/components/cms/panels/AnalyticsPanel.vue` and `apps/web/src/lib/analytics-view.ts`: show `secondPage` ("share that reached a second area"), area transitions and exits. The API already returns them (`apps/server/src/routes/analytics.ts:340-372`). Add unit tests for the view functions.
- Note the real limits in the panel copy: visits that switch language reload, an external link ends a visit.

**Step 1: Resolver and types for `week`, `playing`, `recent`** (`packages/core`)
- `modules.ts`: add the three kinds, remove `teasers` and `glance` (and delete their branches). `view.ts`: view types and `ResolvedModule` union. `resolve.ts`: three resolver branches built from `ResolveInput` (reuse `teaserViews` pieces, `statViews`, `eventText`, `relativeTime`, `freshnessOf`, `compactNumber`, the 7 day ledger sum already computed for the Life teaser at `resolve.ts:554-556`, `playHistory`, `musicHistory`, `gameMeta`). `ui-messages.ts`: new keys, EN and DE together (typed `DE: Messages`, so a missing key fails typecheck). `ia.ts`: `LAUNCH_MODULES` and `LAUNCH_NAV` Home order.
- Tests (`packages/core/tests`): one test file per module with fresh, stale, failed, never, empty, one clause missing, singular and plural, German number format. Update `nav-lint.test.ts` expectations only if needed.

**Step 2: Components** (Sonnet subagent, files owned: new `WeekSection.vue`, `PlayingSection.vue`, `RecentSection.vue`; delete `TeasersSection.vue`, `GlanceSection.vue`)
- Reuse `ui/ArtTile.vue`, `ui/RankedRow.vue` (`variant="type"`), the dated feed pattern from `ActivitySection.vue`, `Freshness.vue`. No cards, no icons-plus-tagline, no figure-plus-caption. Mono only for the feed timestamps (raise `MONO_MAX` for `RecentSection.vue` to 1 in `apps/web/scripts/lint-design.ts` with the reason). No accent in the new files.
- Register in `shell/Module.vue` `sections`, `useLayoutEditor.ts` `PANEL_FOR_KIND`, `editorHelpers.ts` `KIND_LABELS`, `cmsInspector` `SYNCED_INFO` (tests require every kind covered: `cmsInspector.test.ts`, `layoutEditor.test.ts`).

**Step 3: Hero** (`HeroSection.vue`, `packages/db/src/seed.ts` lede text, the copy sheet)
- Status line first and live, quiet text links with `hero-github` and `hero-contact` click keys, one primary link. Remove the keycap trio. Keep H1 at two lines at 1280px (DESIGN-AUDIT item).
- Seed the new lede. The production lede lives in the CMS, so add the EN and DE lede to `docs/research/2026-11-18-copy-sheet.md` for the owner to paste.

**Step 4: IA migration** (`packages/db/src/seed.ts`)
- Add `glance` and `teasers` to `retiredModules` so deployed stores lose them cleanly. New launch modules are appended by `reconcileIa` in launch order. Update `store.test.ts` (the reconcile, retire and old-home cases) and add a case for "old Home layout becomes the new Home". Update `routes.test.ts` guestbook and hero lookups only if ids moved (they do not). Regenerate the fixture: `pnpm --filter web gen:fallback`. Add the Step 0 `week-*` click keys here.

**Step 5: Docs and lint**
- `apps/web/DESIGN.md` Home families line, `DESIGN-AUDIT.md` checklist items 8 and 12, `docs/OVERVIEW.md` (fix the stale Home description and fonts), `docs/reference/commands.md` if scripts change. No dashes anywhere.

**Step 6: Verify and re-critique** (see below). Target: score 28/32 or more, the alive-proof P1 closed.

## Critical files

`packages/core/src/modules.ts`, `ia.ts`, `view.ts`, `resolve.ts`, `ui-messages.ts`, `engagement.ts`; `packages/db/src/seed.ts` (`reconcileIa`, `retiredModules`); `apps/web/src/components/shell/Module.vue`, `sections/HeroSection.vue` and the three new sections; `apps/web/src/lib/track.ts`; `apps/web/src/components/cms/panels/AnalyticsPanel.vue`, `apps/web/src/lib/analytics-view.ts`; `apps/web/scripts/lint-design.ts`; `apps/web/DESIGN.md`.

Reuse, do not rewrite: `teaserViews`, `statViews`, `eventText`, `relativeTime(iso, now, locale)`, `compactNumber(n, locale)`, `plural()`, `freshnessOf`, `ui/ArtTile.vue`, `ui/RankedRow.vue`, `ui/Freshness.vue`, `scripts/dev-force-state.mjs`, `reconcileIa`.

## Risks and owner actions

| Risk or action | Handling |
|---|---|
| The "most visitors stay on Home" premise cannot be checked in the repo | Step 0 makes the number visible. Ship Step 0 first and read it before and after the layout change. |
| `reconcileIa` resets a CMS-customized Home order to launch order | Tell the owner before deploying. Back up the database first (global rule: no destructive action without it). |
| Owner must paste the new lede (EN and DE) into the production CMS | Copy sheet entry. The seed alone does not change a live site. |
| Home grows tall | Budget: Home at 1280px under 3200px. Check at the end. Cut `recent` to 4 rows if over. |
| New copy is the owner's voice | Drafts above. The owner confirms or edits before merge. |
| `week` sentence could present stale numbers as current | Dropped-clause and freshness rules above, covered by tests. |
| Production data differs from dev (real presence, covers, genres) | Check live after deploy: pulsing dot, cover art, Wrapped genres. |

## Verification

1. Gates after every step (list above), plus `pnpm --filter web gen:fallback` after Step 1 and Step 4.
2. Dev session: `node scripts/dev-up.mjs --id home` (never `pnpm dev`), enable Wrapped via `PUT /api/cms/wrapped` with a window that includes today (for example `fromDate` 10 days ago, `forWeeks` 2), `node scripts/dev-down.mjs --id home` after.
3. Force every state with `node scripts/dev-force-state.mjs --id home --source github --state stale|failed|never|empty|fresh` and check `week`, `recent` and `playing` each render their real state. Check the "one clause missing" cases with `wakapi` forced to `never`.
4. `pnpm --filter web audit:a11y http://localhost:PORT` (targets, contrast, overflow, headings, skip link, focus, EN and DE, light and dark, 1280 and 390).
5. Screenshots of Home at 1280 and 390, EN and DE, light and dark. Check: H1 two lines, sentence wraps cleanly in German, Home height under 3200px.
6. Analytics: with mock data, confirm the panel shows the second-area share, transitions and exits, and that hero and module events arrive (tracker unit tests plus one manual beacon check in the dev session).
7. Reconcile: a store seeded with the old Home (`["hero","teasers","glance","featured","guestbook"]`) boots into the new Home with `glance` and `teasers` gone and no orphan ids (`store.test.ts`).
8. Re-run `/impeccable critique apps/web`. Target 28/32 or more, no P1. Refresh `apps/web/.impeccable/design.json` with the documenter agent if the system description changes.
9. Search for leftovers: no `glance`, `teasers` or `LiveStrip` references in code, docs or tests; no em or en dashes (`lint:design`).

## Progress and deviations

- Step 0 done. Deviation: the API field `secondPage` is marked deprecated in `packages/core/src/api.ts` ("kept for one release, then removed"; the stated successor, `sectionsPerVisit`, counts sections, not areas). The panel tile therefore computes the share itself from `engagement.sessionTabs` with the core function `secondPageFigure`, which is not deprecated and measures areas per visit, the number that answers "do visitors leave Home". Added: the hero is observed by the tracker (`section.hero[id]`), per-destination click keys (`hero-github`, `hero-contact`, `teaser-code`, `teaser-life`, `teaser-blog`, `teaser-about`; old keys stay valid for stored history), and three CMS readouts (reached a second area, where visitors go next, where visits end). Not yet looked at in a browser: do it in the Step 6 dev session. Deploy Step 0 on its own and let a baseline build before the layout change ships.
- Steps 1 to 4 landed together with Step 3 (hero) in one commit, not four. Reason: removing `teasers` and `glance` from core breaks the web typecheck until the new components exist, so the steps cannot each be green on their own. Core resolvers, components, IA migration, hero and fallback fixture are one coherent change.
- Sentence age uses the site's short form ("2d ago", German "vor 2 T"), not "2 days ago" as in the first draft. No other copy changed.
- `playing` and `recent` each got a quiet "more" link after all (`allGamesMusic`, new key; `fullActivity`, existing), with click keys `playing-more` and `recent-more`. The component brief had forbidden them for lack of a string; the plan wanted every part to link deeper.
- Home is 3297px tall at 1280 in EN (budget 3200). Over by about 100px; hero 474, week 271, featured 375, playing 559, recent 335, guestbook 687. If it must shrink: `FEED.recentEvents` 5 to 4, or fewer guestbook rows before "show more" (a CMS setting).
- Deferred to Step 6: forced-state sweep for `week`, `recent`, `playing`; the CMS analytics panel in a browser; German at 390 in light; re-critique.
- Step 5 and Step 6 done. Verified in a dev session: all data states on the new modules (github stale or failed drops the event clause and shows the marker, wakapi stale drops the code clause and shows the marker, wakapi or github never drops silently, no events removes the feed), the German sentence ("Ich habe 28,3 Stunden (46 % TypeScript) programmiert und 11,4 Stunden gespielt. Push nach plantcare-tracker, vor 2 T."), `audit:a11y` (EN and DE, light and dark, 1280 and 390), the reconcile test (old Home becomes the new Home, no orphans), and the CMS readout ("Reached a second area" 70 percent, 58 of 83 completed visits, mock data).
- Re-critique: 25/32 again (previous 25, baseline 23), no P0, one P1 (the hero live signal reads small; with no live presence in dev data the violet pulse was never rendered). The "alive" P1 from the earlier critique is resolved in substance by the week sentence. Open P2s: letter tiles in the cover wall (dev data has no art), a flat middle section, the guestbook as the last block. Several findings come from mock data and need a check on the live site. Snapshot: `apps/web/.impeccable/critique/2026-11-19T21-23-44Z__apps-web.md`.
- Not done (needs the owner): deploy Step 0 first and read the new "reached a second area" number before judging the layout; back up the database before the first boot with the new code (the reconcile resets a customized Home order); paste the new lede into the CMS.
- After the re-critique, the owner chose "also enlarge the hero live signal". Done: the status line is now at heading size with an 11px dot, and "Hallo sagen" moved out of it into the links row as a quiet link, so the status stands alone. Games and music now sit side by side from 900px container width (the cover tiles as 2 by 2, the songs beside them), the GitHub feed shows 4 events instead of 5. Home is 3220px tall at 1280 (budget 3200). The 8 text nodes under 14px that the reviewer counted are the unit labels inside durations ("7h28min"), a deliberate number and unit pairing, so they stay. Not changed: the violet live dot is still grey in dev data (no live presence); check it live. About page left as is (needs the owner's photo or a "currently" fact).
