---
approved: 2026-11-18T20:55:59.004Z
session: 20ca671f-1318-45e9-888c-c08ea75e7cfc
status: active
---

<!-- Written by the save-plan hook. Record deviations below the plan. -->
# Workplan: make the redesign hold up (follow-up to the 2026-11-18 critique)

## Context

The redesign (steps 0 to 10, commits `47d3b75` to `264240e`) removed the loud AI tells. The critique that followed (snapshot `apps/web/.impeccable/critique/2026-11-18T20-20-11Z__apps-web.md`, score 23/32) found three kinds of debt:

1. **The code breaks rules that DESIGN.md states.** Violet decorates the heatmaps, mono labels sit in 18 files, middle-dot chains remain in 9 places, and touch targets are below 24px.
2. **The look is now a quiet default.** The site has no ownable identity device, and Life, Wrapped and Home repeat one ruled-list rhythm.
3. **Unfinished verification.** The stale, failed and never states were never seen, and the German locale has gaps.

Owner decisions (2026-11-18):

- **Order:** rules first.
- **Scope:** everything, including the deeper work.
- **Identity device:** Concept A, the **live strip**. A strip of the last 28 days of real activity sits under the header on every page; only today's cell is violet. The quiet dark base stays.
- **Test art:** generate local placeholder covers in the dev seed (no real art, no licensing).

Out of scope: new features beyond the strip, the CMS, hosting, and the layout tree (`lint:nav` still holds).

## Principles for every phase

- Each phase ends shippable: all five gates pass (`pnpm lint:nav`, `pnpm --filter web lint:tokens`, `pnpm typecheck`, `pnpm test`, `pnpm build`), then one commit per phase (Conventional Commits, no scope, to `main`).
- Verify in a dev session (`node scripts/dev-up.mjs --id <id>`, `dev-down` after, retry once on EPERM) at 1280px and 390px, EN and DE, light and dark.
- Review every scripted edit with `git diff --stat` and a corruption grep (`oorder`, `numoer`, `oackground` must return nothing). Prefer the Edit tool. Never use nested single-element arrays in PowerShell edit scripts.
- No em dashes or en dashes in anything written. Do not add dependencies other than the ones named here.
- File lists below come from the critique and from greps run on 2026-11-19. Each phase starts by re-running the relevant grep, because line numbers move.
- Delegation: Sonnet subagents for phases 5 and 6 (briefs follow the Step 5 to 7 pattern, with file ownership lists so agents never touch the same files). I do phases 1 to 4 and 7 to 10.

## Phase map

| # | Phase | Resolves (critique) | Depends on | Effort |
|---|---|---|---|---|
| 0 | Housekeeping | none | none | 15 min |
| 1 | Rules enforcement and a design lint | P2 "code breaks rules", minor findings | 0 | 3 h |
| 2 | Neutral heat, one live signal | P1 "violet decorates", P3 repeated pulses | 1 | 2 h |
| 3 | Accessibility and mobile header | P2 targets, skip link, Casey | 1 | 3 h |
| 4 | Live strip (data layer plus component) | P1 identity | 2, 3 | 1.5 days |
| 5 | Life and Wrapped | P2 layout variety, Life length | 4, fixtures | 1.5 days |
| 6 | Home and Code rhythm | P2 layout variety | 4 | 1 day |
| 7 | States and failed state | forced states unverified | 4 | 1 day |
| 8 | German locale and copy | P3 locale, lede jargon | 5, 6 | 3 h |
| 9 | Comment dash cleanup (lint starts in phase 1) | owner's global rule | 8 | 3 to 4 h |
| 10 | Final verification and docs | all | 9 | 3 h |

Phases 2 and 3 can run in parallel after 1 (disjoint files). Phase 7 waits for 4 because both touch `packages/core/src/resolve.ts` and `view.ts`.

---

## Phase 0: Housekeeping

- Decide the critique snapshot: commit `apps/web/.impeccable/critique/*.md` with a `docs:` commit, or add the folder to `.gitignore`. Default: commit it (it is the baseline the re-critique compares against).
- Create `docs/plans/2026-11-19-redesign-hardening.md` from this plan (the plan hook may do it) and mirror the phases into the task list.

## Phase 1: Rules enforcement and a design lint

Goal: make DESIGN.md true in the code, then keep it true with a lint.

**Changes**

| What | Where | Detail |
|---|---|---|
| Mono labels to body face | `components/forms/BaseForm.vue` (Name and Message labels), `ui/ModuleSection.vue` (note), `ui/ProjectCard.vue`, `ui/Breadcrumbs.vue`, `ui/RankedRow.vue`, `ui/LanguageBars.vue`, `sections/ActivitySection.vue`, `GlanceSection.vue`, `GuestbookSection.vue`, `PostsSection.vue`, `AreasSection.vue`, `shell/SitePanels.vue`, `styles/app.css` (`.meta`, `.src-note`, `footer`) | Keep `--f-m` only for synced numbers and timestamps. The file list comes from the exploration of every `var(--f-m)` use; each use is classified NUMBER or LABEL before editing. |
| Middle-dot chains | `sections/MusicSection.vue` lines 81, 199, 213, 232; `PlaytimeSection.vue` 102, 216, 267; `WrappedSection.vue` 75; `HeroSection.vue` 33; `sections/TeasersSection.vue` and the Areas detail line in `packages/core/src/resolve.ts` | Use separate cells, line breaks or a comma. Tooltips (`title:`) use a colon. |
| Stragglers | `shell/SettingsModal.vue` (16px, shadow), `error.vue` (clamp sizes to `--fs-h1` and `--fs-display`), `sections/PresenceWidget.vue` and `ui/HeatGrid.vue` (2px and 1.5px radii to `--r-1` or documented exceptions) | Update DESIGN.md if a value stays by design. |
| Alias cleanup | `styles/tokens.css` | Remove `--r-pill` (public no longer uses it; CMS block keeps its own). Do not remove `--sp-*`: about 200 uses; leave with a note. |
| `lint:design` | new `apps/web/scripts/lint-design.ts`; script `lint:design` in `apps/web/package.json`; root `package.json` gets `lint:design` and the root `build` chain becomes `pnpm lint:nav && pnpm lint:tokens && pnpm lint:design && ...` (CI runs `pnpm build`, so `.github/workflows/ci.yml` needs no change) | Model on `lint-tokens.ts`. Fails on, in public code: ` · ` inside templates and strings; `text-transform: uppercase` and positive `letter-spacing`; `→` appended to link text; `var(--f-m)` outside an allowlist file or a `.num` class; accent tokens (`--live`, `--live-ink`) outside an allowlist of selectors (primary button, focus ring, `.fresh`, live dot, today cell). Justified because every item here was a rule that drifted unnoticed. It also runs `lint-dashes` (the ratchet described in phase 9) and writes the first `scripts/dash-baseline.json`. |

**Acceptance:** the exploration's mono and middle-dot lists are empty; `pnpm lint:design` passes and fails on a deliberately bad fixture (test in `apps/web/tests/lint-design.test.ts`); gates green.

## Phase 2: Neutral heat, one live signal

**Changes**

- `styles/tokens.css`: replace `--heat-0..4` with a neutral ramp (dark: from `--surf-2` up to `--muted`; light: from `--line-1` down to `--ink`). Keep `--heat-today` as the one accent step (`--live`). Compute contrast: top step against its card at least 3:1, adjacent steps at least 1.3:1. Update `DESIGN.md` color table and `DESIGN-AUDIT.md`.
- `ui/HeatGrid.vue`, `ui/HeatStrip.vue`: today's cell uses `--heat-today`; other cells never use the accent. Add `aria-label` and `title` with date and value so cells are not color-only (Sam).
- `ui/ModuleSection.vue` and the `Freshness` component: one "synced" marker per page, not per heading. Per-heading markers render only for `stale`, `failed` and `never` (state-bearing). The single fresh marker moves to the live strip in phase 4; until then keep it on the first heading only.
- `app.css` `.fresh .dot`: remove the pulse from every heading; one pulse remains (the presence live dot plus the strip's today cell).

**Acceptance:** accent-consumer grep shows only: primary button, focus rings, presence live dot, today cell, stale/failed markers; the detector's `pulsing-dot` finding is gone; contrast script passes; screenshots of Code and Life show no violet except today and the primary button.

## Phase 3: Accessibility and mobile header

**Changes**

| What | Where |
|---|---|
| Targets at least 24px at 1280px and at least 44px on touch (390px) for: `.more`, footer links, `.seg__opt`, `.list-footer__more`, `.wave`, tabs, `.theme-toggle` | `styles/app.css`, `ui/SegmentedControl.vue`, `ui/ListFooter.vue`, `sections/HeroSection.vue`. Use padding, not larger type. |
| Skip link | `shell/AreaPage.vue` (first focusable element, target `#main`), `error.vue`, `pages/md/[...slug].vue`, `pages/datenschutz.vue`; new key `skipToContent` in `packages/core/src/ui-messages.ts` (EN and DE) |
| Mobile header: wordmark and tabs on one aligned grid | `styles/app.css` (`.top`, `.brand`, `.chrome`, `.tabs`), `shell/AreaPage.vue`. At 390px: wordmark left, settings right, tabs on a second row with the same left edge (x=20). |
| Hero buttons: no orphaned "Contact" at 390px | `sections/HeroSection.vue`, `styles/app.css` (`.links`) |
| Modal focus: trap and return focus | `shell/SettingsModal.vue` (verify first; fix if it fails) |

**New tool:** `apps/web/scripts/audit-a11y.ts` (uses `playwright-core`, already a devDependency): loads `/`, `/code`, `/life`, `/about` in EN and DE at 1280 and 390, and reports target sizes, contrast pairs, overflow, heading outline, focus ring. This is the measuring code the critique's Assessment B wrote by hand; saving it makes checklist items 3, 17 and 20 repeatable. Not part of `pnpm build`.

**Acceptance:** `audit-a11y` reports 0 targets under 24px at 1280px and 0 under 44px at 390px (except inline text links inside paragraphs, which the script lists as exempt), 0 contrast failures, 0 overflow; first Tab stop is the skip link; modal traps focus.

## Phase 4: The live strip (identity device)

**Concept.** A strip of 28 cells, one per day, oldest left and today right, under the header on every page. Each cell's weight is the real activity of that day (GitHub contributions plus game minutes plus listening minutes, normalised). The ramp is neutral; **only today's cell is violet**, and only when today has activity and the data is fresh. The same cell shape and ramp are reused by the heatmap and day strips on Code and Life, so one visual idea recurs.

**Guardrails so the device does not become the next tell:** every cell maps to a real day; hover and focus show date and counts; no decoration (no glow, no animation except the one pulse on today); if there is no data it renders nothing (not a fake strip); it is one element per page, not a repeated section marker.

**Design brief first (1 h):** write `docs/research/2026-11-19-live-strip-brief.md` (placement, cell size at 1280 and 390, ramp, hover content, empty and stale behaviour, reduced motion) before code.

**Data layer (the only data-layer change in this plan; needed because the strip appears on every page, and modules resolve per area):**

| File | Change |
|---|---|
| `packages/core/src/view.ts` | Add `pulse?: { days: string[]; levels: number[]; counts: { commits: number; gameMinutes: number; listenMinutes: number }[]; today: string }` to `SiteView`. |
| `packages/core/src/resolve.ts` | New pure function `buildPulse(input, now)`: merge `source.contributions` (GitHub), `playHistory.ledger` and a new `pulseLedgers.music` over the last 28 days; bucket with the existing `bucketHeat` in `format.ts`; return in `SiteView`. |
| `packages/db/src/site-view.ts` | Build the 28-day music ledger independent of the module window (the module window can be shorter) and pass it as `pulseLedgers`. |
| `packages/core/tests/resolve.test.ts` (or a new `pulse.test.ts`) | Cases: all three sources, one source only, no data (undefined), timezone day boundary, DST day, 28-day window edge. |

**Web:**

- New `apps/web/src/components/shell/LiveStrip.vue`, rendered in `shell/AreaPage.vue` under `.top`. Reuses `HeatGrid` cell styling from phase 2. Keyboard focusable cells (roving tabindex), `aria-label` summary ("Last 28 days of activity, most recent day: ..."), i18n keys in `ui-messages.ts`.
- The single page-level "synced X ago" marker moves into the strip's caption. Remove it from the hero and from the footer duplicate if the strip carries it.
- Update `DESIGN.md` (new component, rule "purple means now" now has one more concrete consumer), `DESIGN-AUDIT.md`.

**Checkpoint (owner review):** after the first render, send before and after screenshots of Home, Code and Life (light, dark, mobile). If the strip reads as decoration, remove it and replace it with a stronger idea before phases 5 and 6 build on it.

**Acceptance:** strip appears on all four areas, EN and DE, 390px and 1280px, no overflow; hover and keyboard work; no data resolves to no strip; resolver tests pass; SSR payload grows by under 2 KB (check `curl` size before and after).

## Phase 5: Life and Wrapped (subagent, after fixtures)

**Fixtures first (30 min, me):** extend `apps/server/scripts/seed-mock-data.ts` to attach generated placeholder covers (flat blocks with a letter, deterministic colours; `sharp` is already a server dependency) for the seeded games and tracks, served through the existing media proxy. Add a hero avatar to the dev seed. Check how the seed handles `art_url` (the exploration lists the exact fields). Nothing real, nothing licensed.

**Layout work (subagent brief, files owned: `PresenceWidget.vue`, `PlaytimeSection.vue`, `MusicSection.vue`, `WrappedSection.vue`, `HobbiesSection.vue`, `GallerySection.vue`, `NowSection.vue`, `ui/StatTile.vue`, `ui/RankedRow.vue`, `ui/HeatStrip.vue`, `ui/DrillPanel.vue`, `ui/ModuleCard.vue`):**

- **Time played vs Listening get different forms.** Time played: an art-led wall of the top games (covers as the primary element, text small), plus the strip. Listening: a typographic list led by artists, with small art. Same data contracts.
- **Wrapped is a poster, not a list.** One oversized Archivo figure per statistic, art-led top songs and games, columns for artists and genres; set apart from ordinary stats (own gap, own rule). No card.
- **Life is shorter.** "When I play" weekday-by-hour heatmap moves behind a disclosure ("show when I play"); lists default to 5 rows with "show N more". Target: Life page height at 1280px reduced from about 4600px to under 3200px.
- Preserve every fact and all i18n keys. No new copy beyond the disclosure label (new key, EN and DE).

**Acceptance:** screenshots of Life (dark and light, EN) show three different forms, not three lists; Wrapped looks like a poster; gates green; no overflow at 390px.

## Phase 6: Home and Code rhythm (subagent, after 4)

Files owned: `HeroSection.vue`, `TeasersSection.vue`, `GlanceSection.vue`, `FeaturedSection.vue`, `GuestbookSection.vue`, `ActivitySection.vue`, `CodingSection.vue`, `ProjectsSection.vue`, `ui/ProjectCard.vue`.

- **Home:** with the strip carrying "alive", merge the Glance figure into the Areas index (rows keep name, value, detail; the big figure moves to the Code row). Featured gets a larger lead image; Guestbook gets its own lower-key form. Break the identical heading-plus-ruled-rows pattern: Areas as a large-type index, Featured as image-led, Guestbook as a quote column. Preserve every fact shown today.
- **Code:** the figure row and heatmap use the strip's cell grammar; the event feed keeps the date gutter.
- Hero: the lede keeps "Fachinformatiker Anwendungsentwicklung" but moves emphasis off it (see phase 8 for the gloss).

**Acceptance:** Home sections use at least four different layout families (counted by the same method as the original checklist item 12); no regression in `audit-a11y`.

## Phase 7: States and the failed state

**Known gap:** `FreshnessState` includes `failed`, but `resolve.ts` only returns `fresh`, `stale` and `never` (lines near 469 to 474). `sync_status` already stores `lastErrorAt` and `lastError` (`packages/db/src/sync-status-repo.ts`), so the data exists and is not wired.

| What | Where |
|---|---|
| Wire `failed` | `ResolveInput.freshness` gains `failedAt?: Partial<Record<SourceId, string>>`; `packages/db/src/site-view.ts` fills it from `store.syncStatus`; resolver returns `failed` when `lastErrorAt` is later than the last success; the module shows its last data with a plain "last sync failed" marker (new keys, EN and DE). |
| Core tests | `packages/core/tests/resolve.test.ts`: five states, plus a failure after success and a success after failure. |
| Dev tool | new `scripts/dev-force-state.mjs --id <id> --source github|wakapi|rawg --state fresh|stale|failed|never|empty` that edits the isolated dev DB (`data/agent-<id>/*.sqlite`) with `node:sqlite`. Touches only that id's directory. |
| Visual sweep | For Home, Code and Life: force each state, screenshot once per state for one module each, check text and layout, record results in `DESIGN-AUDIT.md` (checklist item 16 closes). |
| Edge cases | Long content (60-character repo name, 60-character game name), one item, 500 items for ranked lists, German overflow. Fix what breaks. |

**Acceptance:** all five states render for each synced module; tests green; checklist item 16 passes with evidence.

## Phase 8: German locale and copy

- **Numbers and durations:** format through `Intl.NumberFormat(locale)` in the `Duration` component and the hero and teaser values ("11,4 Std."). Exact file from the exploration (`Duration` and `packages/core/src/duration.ts`).
- **Event strings:** "Pushed 3 commits to X" is built from synced event data; add message keys with plurals (`packages/core/src/ui-messages.ts`, `plural()` already exists) so DE reads "3 Commits nach X gepusht". Do not translate repo names.
- **"Winken":** default to "Hallo sagen" (the current "Winken" is not idiomatic for the Wave button). The owner confirms the wording; flag it in the copy sheet. This is the owner's voice, so keep it a one-line decision.
- **Lede jargon:** add a plain gloss after the apprenticeship title ("Fachinformatiker Anwendungsentwicklung, also software developer by training"). The gloss only translates the title; it adds no claim. Update `packages/db/src/seed.ts`, regenerate `fallback-site.json` (`pnpm --filter web gen:fallback`), and update `docs/research/2026-11-18-copy-sheet.md`.
- **Hobby taglines:** leave unchanged (decided earlier).

**Acceptance:** DE pass at 390px and 1280px shows no English event strings, correct decimal commas; tests updated; copy sheet current.

## Phase 9: Comment dash cleanup and lint

The owner's global rule bans em and en dashes in code comments. Measured on 2026-11-19 (comment lines carrying a dash, files in brackets): `apps/web/src` 355 (82), `packages/core/src` 287 (30), `apps/server/src` 153 (34), `packages/db/src` 87 (17), `packages/sources/src` 28 (11), `apps/web/tests` 23 (7), `apps/web/scripts` 19 (2), `apps/server/scripts` 15 (1). Total about 970 lines in 184 files, plus 153 lines in `docs/**/*.md`. That is above the one-go threshold, so the plan **ratchets**:

1. `apps/web/scripts/lint-dashes.ts` (run in phase 1 already, as part of `lint:design`): compares each file's comment-dash count with `scripts/dash-baseline.json`. A file may stay at or below its baseline count and may never exceed it, so no new dashes enter. New files have a baseline of zero.
2. **Touch rule for phases 1 to 8:** any file a phase edits has its comment dashes removed in the same commit, and its baseline entry drops to zero. This clears the files that change most, with no extra review pass.
3. **Phase 9 cleanup of the rest,** one commit per package, by a Sonnet subagent with explicit rules: replace a spaced dash with a comma, a colon or a period by meaning; never touch string literals, test expectations, or markdown tables; review `git diff --stat` and the diff after each package; corruption grep after each. Order: `packages/sources`, `packages/db`, `apps/server`, `packages/core`, `apps/web`, then `docs`. Stop after any package where the diff shows a meaning change.
4. When the baseline is empty, delete it and make the lint absolute.

Effort: the touch rule adds little; the remaining cleanup is about 3 to 4 hours including review. It runs last because it touches many files and would conflict with phases 1 to 8 if done earlier.

## Phase 10: Final verification and docs

- Run all gates, `lint:design`, `lint:dashes`, `audit-a11y`, the contrast script, then a dev session with Wrapped enabled (`PUT /api/cms/wrapped`, `fromDate` 2026-10-10) and forced states.
- Re-run the checklist from `DESIGN-AUDIT.md` and update every result; close items 8, 12, 16, 19 with evidence (item 19: re-run the Krebs scanner if reachable, else the same hand check).
- Re-run `/impeccable critique` on `apps/web`; target at least 28/32 with no P1.
- Update `DESIGN.md` (strip, neutral heat, targets, lint rules), `docs/concepts/design-system.md` pointer, `DESIGN-AUDIT.md`, `docs/reference/commands.md` (new scripts).
- Run `/impeccable document` to refresh `apps/web/.impeccable/design.json`.
- If the strip or any visual change affects the social card, run `pnpm --filter=@lg/web gen:og`, bump `OG_IMAGE_PATH` to `?v=3`, and re-scrape the URL in the X, LinkedIn and Facebook debuggers.

## Critical files (representative)

`apps/web/src/styles/tokens.css`, `app.css`; `components/shell/AreaPage.vue`, `SiteChrome.vue`, `SettingsModal.vue`; `components/ui/HeatGrid.vue`, `HeatStrip.vue`, `ModuleSection.vue`, `SegmentedControl.vue`, `ListFooter.vue`; the section components under `components/sections/`; `packages/core/src/view.ts`, `resolve.ts`, `ui-messages.ts`, `duration.ts`; `packages/db/src/site-view.ts`, `sync-status-repo.ts`; `apps/server/scripts/seed-mock-data.ts`. Reuse: `bucketHeat` (`packages/core/src/format.ts`), `plural()` and `t()` (`ui-messages.ts`), `lint-tokens.ts` as the lint model, `gen-og.ts` and `playwright-core` for the a11y audit, `dev-up`/`dev-down`.

## Verification (end to end)

1. Gates: `pnpm lint:nav`, `pnpm --filter web lint:tokens`, `pnpm --filter web lint:design`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
2. `node scripts/dev-up.mjs --id harden`; run `audit-a11y` against the printed URL; enable Wrapped; force each state with `dev-force-state`; screenshot Home, Code, Life, About at 1280 and 390 in EN and DE, light and dark (use a contact sheet, not single views); `dev-down`.
3. Re-run `/impeccable critique apps/web` and compare with the 23/32 baseline.

## Risks

| Risk | Mitigation |
|---|---|
| The strip becomes a decoration tell. | Guardrails above and the owner checkpoint before phases 5 and 6. |
| `resolve.ts` and `view.ts` conflicts between phases 4 and 7. | Serialise them; 7 starts after 4 is committed. |
| Phase 5 and 6 subagents produce layouts that look alike again. | File ownership lists, explicit "four different families" acceptance, my own screenshot review before each commit. |
| Mass comment edits corrupt files. | Per-directory commits, diff review, corruption grep, ratchet fallback. |
| A scripted edit repeats the `b` to `o` incident. | Explicit (file, old, new) triples only; grep after every script. |
| German wording is the owner's voice. | Defaults flagged in the copy sheet; one-line owner confirmation. |
| Effort is underestimated. | Phases 4, 5 and 6 are the large ones (about 4 days together); phase 4's checkpoint can stop the chain early. |

## Owner decisions needed during execution (with defaults)

1. "Winken" wording (default "Hallo sagen").
2. The About page "Contact" button, which currently links to its own section (default: link to the form when the relay is configured, else to the mailto).
3. Commit the critique snapshot (default: yes).
4. Comment dashes: measured at about 970 comment lines in 184 files (plus 153 doc lines). Default: ratchet plus the touch rule, then cleanup per package in phase 9. The alternative is to accept the existing comments and enforce the rule only for new code (saves about 3 to 4 hours).

## Findings from the code exploration (2026-11-19), and what they change

These refine the phases above. Where a finding contradicts the plan text, the finding wins.

**Phase 1 (rules)**
- Mono labels to move to the body face (`var(--f-m)` used for words): `BaseForm.vue:34` (field labels) and `:49` (`.ok`), `ActivitySection.vue:205` (`.em`), `AreasSection.vue:113`, `SitePanels.vue:62` (`.cold-start`), `Breadcrumbs.vue:54`, `HeatGrid.vue:189` (legend), `ModuleSection.vue:73` (note), `app.css:338` (`.doc-home`) and `:656` (`.md-draft`), `docs/api.vue:342` (table headers). `ProjectCard.vue:159` and `app.css:253` (`.meta`) mix numbers and words: split the number into its own `<span class="num">`.
- Mono stays for: `.tm` (relative age), `.glance-latest .m`, `.post-m time`, `.wave-count`, `.pc`, `.rr-val`, `.pt-heat-axis`, `error.vue .code`, API doc code, `.prose code`. `.foot-sync` and `.fresh` are whole sentences: move them to the body face too.
- Dead CSS to delete: `app.css:279` `.src-note`.
- Extra middle-dot sites beyond the critique: `packages/core/src/resolve.ts:634` (hero eyebrow `name · role · location`, which also lands in `fallback-site.json` lines 57 and 408, so regenerate it), and message keys `contributionsScope`, `teaserLatest`, `freshFailed`, `codingScope` in `ui-messages.ts` (EN lines about 99, 231, 235, 267; DE about 329, 432, 436, 459). `CodingSection.vue:20` hardcodes the English "h tracked" while the key `codingScope` sits unused: use the key.
- The comment-dash counts differ slightly by method (apps/web/src 355 vs 408). The baseline script counts exactly and replaces both numbers.

**Phase 2 (heat and one signal)**
- Only `HeatGrid.vue` consumes `--heat-*`; light mode has no `--heat-today` override (add one). `--live` is not used by any of the four heat components, only `--live-ink` for focus and selection outlines.
- `Freshness.vue` renders per heading in `ActivitySection`, `CodingSection`, `FeaturedSection`, `ProjectsSection`, `GlanceSection` (Home 2, Code 3). The footer `p.foot-sync` already carries a page-level "synced" line, always worded "fresh". Plan change: per-heading markers render only for stale, failed, never and empty; the footer line stays until phase 4 moves it into the strip.

**Phase 3 (accessibility)**
- Target heights today: `.more` about 20px, `footer a` about 20px, `.seg--sm .seg__opt` about 22px, `.list-footer__more` about 23px, `.wave` about 30px, `.tab` about 41px (width = text), `.theme-toggle` 40px, `.btn` about 50px.
- Mobile header cause: `.top` wraps, and `.chrome` keeps `margin-left: auto`, so on the second flex line it jumps to the right edge and its left edge falls where its own width ends. Fix: below 560px make `.chrome` full width with `margin-left: 0`, and put the settings button in the first row (for example `.top` as a grid: brand and toggle on row 1, tabs on row 2).
- Skip link: `<main>` (in `AreaPage.vue`) has no id and wraps the header; docs pages have no `<main>`. Add `id="content"` on a wrapper that starts after the header and strip, and use that as the skip target; add a `<main>` to the docs shell.
- Hardcoded English aria-labels to move into message keys: "Sections" and "Settings" (`SiteChrome.vue`), "Footer" (`AreaPage.vue`).

**Phase 5 (fixtures)**
- Nothing is seeded with images. `music_plays.art` exists and is never filled; game covers come from RAWG, and without one the media proxy serves an initials SVG tile. The proxy only fetches allowed hosts, so local URLs are refused. Fixture route: write generated WebP files into the dev `MEDIA_DIR` as library assets (served by `/assets/:id`) and set `music_plays.art` and a `game_meta` cover to those asset URLs; confirm how `RankedRow` and `MusicSection.artSrc` build the URL before coding. Avatar: `content.meta.avatar` is unseeded; seed one library asset the same way.

**Phase 7 (states)**
- Confirmed: `freshnessOf()` (`resolve.ts` about 467 to 476) returns never, empty, stale, fresh. `failed` exists only in the type. Sync errors live in `sync_status` and are read by `cms-status.ts`.
- Dev forcing, per state, on the isolated DB `data/agent-<id>/letsgaming.sqlite`, table `source_current(source_id, synced_at, data)`: stale = `UPDATE source_current SET synced_at='2026-01-01T00:00:00Z' WHERE source_id='github'` (use github; wakapi re-syncs every 30 minutes); never = `DELETE ... WHERE source_id='github'`; empty = set `data` to `'null'` (Activity, Glance, Coding) or to JSON with no repos (Projects); fresh = `POST /api/cms/sync/github`; failed = only after the wiring in this phase.
- `dev-force-state.mjs` wraps exactly those statements.

**Phase 8 (German)**
- "11.4 Std." comes from `resolve.ts` about 552 (`Math.round(weekMinutes/6)/10`) interpolated through `String()` in `t()` (`ui-messages.ts` about 501 to 502). Fix once in `t()`: format non-integer numeric vars with `Intl.NumberFormat(locale)`. `compactNumber` and `trim` in `format.ts` use `toFixed(1)` ("2.1k"): pass the locale. `relativeTime` returns English unit letters ("2h", "3d", "1w", "mo") inside DE templates; decide the German unit forms in this phase.
- English event strings in DE come from the mock GitHub events (`packages/sources/src/github/mock.ts` about 88 to 101): they carry `text` and no `repo`, and `eventText` falls back to raw `text`. The real adapter stores type and repo and localizes correctly. Fix the mock so dev matches production, then keep the localized keys. The heatmap legend ("less", "more", `HeatGrid.vue`) is hardcoded English: add keys.
- DE strings to review: `waveButton` "Winken", `waveDone` "Gewinkt", `hoursShort` "Std.", `minutesShort` "Min".

**Tests at risk (update with the change that breaks them)**
`packages/core/tests/landing.test.ts` (teaser strings), `packages/core/tests/resolve.test.ts` (event text, "public repos", headings, `syncedRelative`, freshness states), `apps/web/tests/components/SiteShell.test.ts` (rendered section text), `module-anchors.test.ts` (section ids, `.panel` structure: keep the hero's parent `.panel` when adding the strip), `RankedRow.test.ts` (`.rr-mono`, `img.rr-art`), `fallback.test.ts`.

## Progress and deviations

- Phase 0 done (`5aa1514`).
- Phase 1 done. Deviations, with reasons:
  - Mixed number-and-word lines (`.meta`, `.p-meta`, `.fresh`, `.foot-sync`) moved to the body face with tabular numerals, instead of splitting each number into its own `.num` span. Reason: one CSS line per rule, no template churn, and the figures still align. Mono now marks only standalone synced values.
  - The hero `eyebrow` (an uppercase `NAME · ROLE · LOCATION` string) was dead data: no component renders it. Removed from `HeroView`, `resolve.ts`, two test fixtures, and the regenerated fallback. This is the one data-layer touch in Phase 1.
  - Middle dots in message keys became commas (`contributionsScope`, `teaserLatest`, `freshFailed`, `codingScope`, EN and DE); day-summary and title strings use a comma or a colon.
  - `--r-pill` moved from `:root` to the `.cms` block (only the CMS uses it). `--sp-*` stays (about 200 uses).
  - The 2px and 1.5px radii in `PresenceWidget` (equaliser bars) and `HeatGrid` (cells) now use `--r-1`. On the 2 to 3px bars this makes them fully round.
  - `SettingsModal`: close button 16px became `--fs-body`; the panel shadow is now `--sh-anchor`. `error.vue` uses `--fs-display` and `--fs-h2`.
  - `lint:design` is `scripts/lint-design.ts` plus `scripts/lint-dashes.ts`, with pure checks in `scripts/design-rules.ts` and tests in `tests/lint-design.test.ts`. It is in the root `build` chain, so CI runs it. Mono and accent are per-file ratchets (`MONO_MAX`, `ACCENT_MAX` in `lint-design.ts`).
  - Comment dashes: baseline written at 983 lines in 189 files; the touch rule cleaned the 23 files this phase edited, leaving 840 lines in 170 files. `--fix` uses a mechanical rule (spaced dash to comma, digit range to "to"), so some comments are comma splices. Phase 9 reviews them.
  - Tool caveat found: `\uXXXX` escapes typed into a file write are converted to literal characters before the write, which tripped the no-dash hook. The dash patterns are built from char codes instead.
  - Gate caveat: after a type change in `packages/core`, rebuild it (`pnpm --filter @lg/core build`) before the web typecheck.
  - Verified in a dev session: label font changed, no middle dots in rendered Home, Code and Life text, no overflow at 390px (DE).
- Phase 2 done. Deviations, with reasons:
  - Heat ramp is neutral (`--heat-0..4`), with the top step on a card at 4.53:1 (dark) and 3.91:1 (light). Computed so violet "today" is clearly lighter or darker than its neighbours (1.4:1 or more), since hue alone is a weak signal.
  - `--heat-today` is now `--live`: the today cell is violet when it has activity, a ring when it does not. The old rule "today never the accent" existed only because selection used the accent; selection now uses `--ink-strong`, so the two marks no longer collide.
  - `HeatGrid` gained an accessible name for static grids (`label` prop, `role="img"`), `aria-label` on selectable cells, and `heatLess` and `heatMore` message keys (the legend words were hardcoded English; this pulls that German-pass item forward).
  - `Freshness.vue` renders nothing when data is fresh; stale, never and empty stay muted, failed uses the error colour. The pulse dot and `.fresh.fr-fresh` accent are gone. The page-level "synced" line stays in the footer until the strip (Phase 4) takes it.
  - Measured on Code: 0 accent-coloured elements in both themes, 0 freshness markers (all fresh). Today cells appear on the Life day strips; they are checked in the Phase 3 and 4 browser passes.
