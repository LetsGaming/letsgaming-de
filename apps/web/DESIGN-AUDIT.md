# Design audit

Audit of the site as of 2026-11-18 against `DESIGN.md` and the findings in `docs/research/2026-11-18-redesign-research.md`.

Status column: `open` until the step in `docs/plans/` resolves it. At the end of the redesign each row gets the resolving commit hash.

| ID | Status | Where | Problem |
|---|---|---|---|
| D1 | open | `styles/tokens.css:24,48`, heat-4 | Accent values are exact Tailwind violet-500 `#8b5cf6`, violet-400 `#a78bfa`, violet-800 `#5b21b6`. `DESIGN.md` says the violet was sampled off a real LED strip. The values say Tailwind default. |
| D2 | open | `tokens.css:77-80` | All four dark surfaces are violet-tinted (`#0e0c18` to `#2d2650`). The whole page reads purple, the top user-reported tell. |
| D3 | open | `tokens.css`, `cms.css:2068`, `error.vue:60`, `BaseForm.vue`, `SegmentedControl.vue` | Contrast fails. Dark `--live` as text: 4.10 / 3.74 / 3.30 on surf-1/2/3. `--muted` on surf-3: 4.44. `--line-1` as an input border: 1.17 (needs 3:1). White on `--live-solid`: 4.71 (passes, thin margin). |
| D4 | resolved (Step 2) | `nuxt.config.ts:104-116`, `tokens.css:140-142` | Inter (weak tell) and Space Mono used as a "technical" costume. |
| D5 | resolved (Step 2) | `TeasersSection.vue:60`, `app.css:369`, `PresenceWidget.vue:369`, `SettingsModal.vue` | Uppercase tracked mono labels: template-chrome tell. |
| D6 | resolved (Steps 2 to 7, 10) | `tokens.css:144-155`, `StatTile.vue:92,99`, many | Body 15px (under the 16px floor). Meta 11 and 12px. `--fs-display` and `--fs-lede` unused. Raw sizes 9, 10, 11.5, 13, 14, 17, 18, 20, 24, 34px off the scale. |
| D7 | resolved (Step 3; round shapes, 2px bars and the settings switch track stay) | `app.css:176`, tabs, toggle, brand mark, `HeroSection.vue:241`, gallery, modal | Radius drift: raw 9/11/12/15/16/24px beside the 8/10/14/18 tokens. |
| D8 | resolved (Step 5) | `HeroSection.vue`, `seed.ts:45-47` | Hero: one accented word with a tilted underline bar (named tell); em dash in the H1; 8 stacked elements (avatar, H1, lede, status, presence line, synced, two buttons, "Wave" pill). |
| D9 | resolved (Step 3) | `HeroSection.vue:165,199`, `app.css:645` | `--glow-live` has three call sites; the rule says one. The status line pulses even when nothing is live. |
| D10 | resolved (Step 3) | `app.css:646` | Bug: global `animation: pulse` points at a scoped (hashed) keyframe, so the freshness dot never pulses. |
| D11 | resolved (Step 7) | `HobbiesSection.vue`, `tokens.css:112-115,242-245` | Four invented gradient tones in a 4-column identical tile grid. Breaks the system's own imported-color rule. |
| D12 | resolved (Step 5) | `TeasersSection.vue` | Auto-fit grid of identical boxes (label, value, detail): stat-banner tell. |
| D13 | resolved (Steps 6 and 7) | Activity, Coding, Playtime, Music, Wrapped, Presence sections | Six modules in `ModuleCard`. Life renders four card sections in a row: section-layout repetition. |
| D14 | resolved (Step 4) | `ui/ModuleSection.vue:55-58` | Every module gets the same heading row and the same 52px gap. No rhythm difference between related and unrelated sections. |
| D15 | resolved (Step 3) | `app.css:246-256`, `tokens.css:237-238` | Light-mode card has border and shadow at rest: ghost card. |
| D16 | resolved (Steps 5, 6 and 9) | Featured, Glance, Projects links | `→` appended to link text ("see all my work →", "full activity →"); round arrow badges on cards. |
| D17 | resolved (Step 4) | `shell/AreaPage.vue:90-94` | Footer `last synced · @handle · Docs · Privacy`: middle-dot string. |
| D18 | resolved (Step 4) | `AreaPage.vue` header | Brand mark "D" in a 30px rounded tinted square: generic lettermark. |
| D19 | resolved (Step 9) | `seed.ts:50,56,60-61,64,79-100,115`, `lib/site-meta.ts:18-20`, `ui-messages.ts`, `nuxt.config.ts:121` | Copy: "by day / by night" construction three times; "genuinely" and "quietly" (current AI word list); four hobby blurbs as a matched set; em dashes in H1, bio, now items, empty states, page title. |
| D20 | resolved (Step 3) | `SettingsModal.vue:140-141` | `backdrop-filter: blur(4px)` on the overlay: decoration, not meaning. The docs top bar blur at `app.css:510` stays: chrome over content. |
| D21 | resolved (Step 8) | `pages/md/[...slug].vue`, `datenschutz.vue` | Bug: `.prose` has no global styles, so blog posts are unstyled; the legal page uses inline styles. |
| D22 | resolved (Step 8) | `error.vue` | German only while the site defaults to English. (`datenschutz.vue` stays German: German legal text.) |
| D23 | resolved (Step 2) | `styles/cms.css:26` | Bug: `--cms-font-value: var(--cms-font-value)` refers to itself; CMS values lose their mono face. Touched because the font swap changes this token. |
| D24 | resolved (Step 7) | `PresenceWidget.vue:183,215,357` | Gradient washes on the widget and avatars. |
| D25 | resolved (Step 5) | `FeaturedSection.vue` | Card kit: screenshot, round arrow, language chip, "Pinned" pill, 3-line clamp, identical cells. |
| D26 | resolved (Step 3) | Media queries 720/680/560/520 | No breakpoint system; four nearby values. |
| D27 | resolved (Steps 6 and 7) | `SegmentedControl.vue` (selected option), range note in `PlaytimeSection.vue` and siblings | Accent used for a selected state and for a static range label. Breaks "purple means now". Found while checking Step 1 in the browser. Resolve in Steps 6 and 7 with the section rebuilds. |

## Contrast measurements (current values, WCAG 2.x)

Dark theme, text on surfaces (surf-0 / 1 / 2 / 3):

| Foreground | surf-0 | surf-1 | surf-2 | surf-3 |
|---|---|---|---|---|
| `--ink` `#ece9f7` | 16.20 | 14.53 | 13.24 | 11.67 |
| `--muted` `#948cb6` | 6.17 | 5.53 | 5.04 | **4.44** |
| `--live` `#8b5cf6` | 4.57 | **4.10** | **3.74** | **3.30** |
| `--live-ink` `#a78bfa` | 7.12 | 6.38 | 5.82 | 5.13 |
| `--danger` `#ff6b5e` | 6.93 | 6.22 | 5.67 | 5.00 |

Other pairs: white on `--live-solid` `#8351f5` 4.71; white on `--live` 4.23; `--line-1` on surf-0 1.17; `--line-2` on surf-1 1.46. Light theme text pairs all pass (lowest: `--muted` 4.79 on surf-0).

Bold values fail WCAG AA for normal text (4.5:1). The border values fail WCAG 1.4.11 where the border is the only boundary of a control (3:1).

## Finished-redesign checklist (run 2026-11-18, final tree)

Method: greps over public source (CMS excluded), a contrast script that reads the real values in `tokens.css`, `lint:tokens`, and browser checks on a dev session at 1280px and 390px, EN and DE. "Judgment" means a person has to decide; the numbers are given where they exist.

| # | Check | Result |
|---|---|---|
| 1 | Accent only for live data, the one primary button, the focus ring | Pass after fixes. Consumers now: hero live dot, fresh-sync dot, presence game colour, primary button, focus rings (global and HeatGrid), `CardHeader` `is-live` (variant with no users). Fixed in Step 10: error code, docs API version badge, `AreasSection` icon. |
| 2 | No surface chroma above 0.02 | Pass. Max 0.015 (dark `--surf-2`, `--surf-3`). |
| 3 | Contrast | Pass. All text pairs at least 4.5:1 on all four surfaces in both themes, accent non-text at least 3:1, `--line-control` at least 3:1, white on `--live-solid` 5.32 (dark) and 7.21 (light). |
| 4 | No uppercase or letter-spaced labels | Pass after fixing `api.vue` `.api-verb`. Uppercase remains only in JS for one-letter monograms. |
| 5 | No trailing arrows, no em or en dashes in rendered pages | Partial. Done: catalog, seed, titles, headings, fallback fixture, `AreasSection`. Left: `datenschutz.vue` (German legal text: one " — " and one "→" in a menu path) because the wording is legal text for the owner to review. |
| 6 | Tokens for radii and sizes, no radius above 10px | Pass. `lint:tokens` passes; the only larger radius is the settings switch track (documented). |
| 7 | No border plus shadow at rest | Pass. Remaining shadows: keycap edge, live dot glow, modal and docs drawer (floating), one inset selection ring. |
| 8 | One animated pulse, only when live | Pass (2026-11-19). The per-heading and per-page "fresh" dots are gone (a marker shows only for stale, failed, never or empty). One pulsing dot remains on the hero status line, plus the presence widget activity animations. All render only for live data and stop under reduced motion. |
| 9 | No scroll entrance animation | Pass. Only analytics uses `IntersectionObserver`. |
| 10 | No `backdrop-filter` outside the docs top bar | Pass. |
| 11 | Body 17px, prose at most 66ch | Pass (measured 17px; `.prose` is 66ch). |
| 12 | No layout family repeats, at most two `ModuleCard` per page, no eyebrow labels | Pass (2026-11-19). `ModuleCard` is used once on the whole site (Coding, on Code), counted by grep. Layout families: Home has five (hero type, Areas index, Glance margin column, Featured image lead with unruled grid, Guestbook quote column). Life has three distinct forms (cover wall, typographic list, Wrapped poster). Judged on screenshots of Home, Code and Life. |
| 13 | Hero at most four text elements; H1 two lines at 1280px | Pass. Hero has title, lede, status line, button row. H1 is two lines at 1280px in EN and DE (DE wraps to three at 390px). |
| 14 | Squint test | Judgment. Primary, secondary and groups were nameable on the Home, Code and Life screenshots. |
| 15 | Cover-the-name test | Judgment. The first viewport states the role, the apprenticeship and what the owner builds. |
| 16 | Every state renders (fresh, stale, empty, failed, never) | Pass (2026-11-19). Forced each state on the GitHub source with `scripts/dev-force-state.mjs` and read the rendered markers: stale "10mo old", failed "sync failed, showing 1m old" (error colour, last data kept), never "not synced yet", empty "nothing synced", fresh no marker, on Home and Code. The `failed` state existed only as a type before this work; it is now produced from `sync_status` and covered by resolver tests. Life modules have no freshness marker by design (observed data, no TTL). Also checked: 60 character repo, game and song names (one overflow found and fixed: the unbroken description in the Featured lead), and a one item dataset. `audit-a11y` passes in every state. |
| 17 | German at 390px | Pass for page overflow on all four areas (scroll width at most the viewport). Individual buttons and tabs were not measured separately. |
| 18 | AI word list in copy | Pass. Remaining matches are in code comments only. |
| 19 | Krebs pattern count (3 or fewer) | Not run (the scanner is an external site). By hand against the tell table in the research doc: no purple gradient, no glow outside the live dot, no side-tab, no glassmorphism, no emoji icons, no fade-up, no feature-card grid, no eyebrow labels. The page is still dark-by-default with one violet accent, which is the closest remaining match. |
| 20 | Reduced motion and keyboard focus | Pass. Global `animation: none` under reduced motion and a global `:focus-visible` ring. `audit-a11y` presses Tab on every page at 1280px: the first stop is the skip link and it shows a ring. The settings modal traps focus and returns it. The full keyboard order across every control was not walked by hand. |

## Open items for the owner

1. Paste `docs/research/2026-11-18-copy-sheet.md` into the production CMS. Seed edits do not reach the live database.
2. ~~Replace `apps/web/src/public/og-image.png`~~ Done. It is now generated by `pnpm --filter=@lg/web gen:og` (see `docs/reference/og-image.md`). Still to do on your side: re-scrape the URL in the X, LinkedIn and Facebook debuggers.
3. Review the German legal text dashes in `datenschutz.vue`.
4. The About page "Contact" link points at its own section. Decide whether it should open the form, or go.
5. Run `/impeccable document` to refresh `apps/web/.impeccable/design.json`, which still describes the old system.
6. Check the Featured screenshot slots and the Wrapped genre list on the live site (the dev data has neither).
7. ~~Forced states~~ Done (checklist item 16).
8. Wrapped top genres rendered nowhere in dev (the seed has no genres): check them on the live site.
9. The Glance figures are still a separate module from the Areas index (merging needs a resolver change and breaks the CMS module mapping). Decide whether that is worth a larger change.
10. The hero lede is now h2 size and wraps to about five lines at 390px. Say if it should be smaller.
