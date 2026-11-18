---
approved: 2026-11-18T11:19:20.660Z
session: 20ca671f-1318-45e9-888c-c08ea75e7cfc
status: active
---

<!-- Written by the save-plan hook. Record deviations below the plan. -->
# Redesign letsgaming.de: research, design system, audit, plan

## Context

The site should read as professional and not as AI-generated. Scope is visual design, layout,
hierarchy, component structure, and copy. Features, routes, data layer, and build tooling are out of
scope. This file holds all four deliverables, because plan mode allows no other file writes. Step 0
copies them into the repo before any code changes.

Decisions already made by the owner (2026-11-18):

- Violet scope: **accent only**. Keep the violet hue for the accent, re-derive its shades off the
  Tailwind defaults, and drop the chroma of the neutral ramp to near-neutral with a faint violet
  cast.
- Type: **replace all three faces** (Fredoka, Inter, Space Mono).

Read as: personal homepage, mostly Read and Operate mode (stats and lists people scan), with one
Experience moment (Wrapped). Audience: dev and gaming peers, friends, family (from `apps/web/PRODUCT.md`).

---

## Appendix A: Research findings (copy to `docs/research/2026-11-18-redesign-research.md`)

Markers: **[V]** verified from a primary source, **[U]** reported by users (count = distinct
people / threads), **[I]** my inference. Counts come from regex over 570 Reddit comments (369
people, 16 threads, read via the pullpush.io archive) and about 1,380 HN items. Treat them as rough.

### A1. What professional looks like now (9 sites, fetched 2026-11-18, HTML and CSS only, not rendered)

| Site | Mechanism |
|---|---|
| tonsky.me | One family (IBM Plex Sans). Size derived from cap height; gap = cap height; radius = cap height / 3. 575px column. Saturated yellow `#FDDB29` ground; every gray is black at an opacity (0.4 text, 0.2 lines, 0.06 fills), so nothing competes with the one color. Posts grouped under year headings. [V] |
| rsms.me | Inter and InterDisplay only. Every dimension is a multiple of one `--unit`. Chrome is white; color lives on individual project tiles (display-p3 mint, pink, brown), so color belongs to content. [V] |
| gwern.net | Source Serif 4 body at 20px, 935px max. Pure grayscale, no accent hue. Depth comes from structure (sidenotes, popups, backlinks), not decoration. [V] |
| stephango.com | System stack, headings weight 500, fluid body `calc(1.5rem + .25vw)`. Two widths (37em, 54em). Radius 4px, images 6px. One yellow highlight token. Home = latest post, then a flat topic list; has a /now page. [V] |
| lynnandtonic.com | Two committed display faces, sizes jump from 1.2rem to 6rem. Three color tokens total, swapped with `light-dark()`. Versioned site ("v. XIX"). [V] |
| frankchimero.com | One 36rem column. Spacing steps 0.25/0.5/1/1.5/4/6rem: big jumps between groups. 8 hex values, one muted green-gray accent. Works listed with type and year ("Essay · 2025"); metadata classifies, no cards. [V] |
| paco.me | 640px content inside a 1072px grid, 128px top offset. 11-step neutral scale. Motion handled with reduced-motion; experiments kept in a separate /craft section. [V] |
| maggieappleton.com | Serif display and body, Lato UI, Plex Mono code. Several named accents (the exception). Each nav item has a one-line description of its content type. 12 images on the home page. [V] |
| feltron.com | Personal annual data reports. Site chrome is gray only (`#f8f8f8`, `#333`, `#999`, `#ccc`), so the report images are the only color. Directly relevant to Wrapped and music stats. [V] |

Patterns [I, from the table]: 7 of 9 use zero or one accent. Text column is fixed between about
575 and 935px. Several derive spacing from the type. Hierarchy comes from content metadata (year,
type, description), not from card containers. None uses an eyebrow label system or a card grid as
the main structure.

### A2. AI tells, catalogued

Primary sources: Anthropic frontend-design SKILL.md [V]
(github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md); Adrian Krebs, 1,590 Show
HN pages scanned against 16 patterns, 22% match 4+ [V] (adriankrebs.ch/blog/design-slop);
Wikipedia "Signs of AI writing" [V].

**Visual, supported:**

| Tell | Evidence | Alternative |
|---|---|---|
| Purple / indigo, purple-to-blue gradient | Strongest single tell. Anthropic (older text), Krebs. [U] Reddit 38/13, HN 40/38. Traced to Tailwind UI `indigo-500` default. | Color from the subject; flat fills; accent used rarely |
| Untouched shadcn / Tailwind look | Krebs; r/ClaudeCode meta-analysis #1 [U] Reddit 12/11, HN 39/43 | Own spacing and radius tokens |
| Identical cards, everything in a card | Anthropic, Krebs | Layout matches importance: list, table, prose, one big plus small |
| One radius everywhere | Anthropic. [U] Reddit 31/12, contested | Radius by role |
| Uniform soft shadow, colored glow | Anthropic, Krebs. [U] Reddit 13/8 | Border or contrast; elevation only for floating things |
| Fade-up on scroll, hover on every card | Anthropic. [U] Reddit 4/4, HN calls it the most annoying | One authored moment; motion answers user action |
| Dark mode with neon glow | Krebs. [U] Reddit 14/11 | Theme chosen for the use; no decorative glows |
| Emoji as icons | Krebs, Wikipedia. [U] Reddit 7/5, HN about 32 | One icon set or none |
| Eyebrow pill above H1, all-caps section labels | Anthropic, Krebs. [U] Reddit 25/10 (third most mentioned) | Plain heading hierarchy |
| One accented word in the headline | Anthropic [V] | Solid headline; emphasis from what it says |
| Template chrome: `A · B · C` meta strings, mono data labels, `→` on links | Anthropic [V] | Metadata in plain text; links named by destination |
| Colored left/top border on cards | Krebs quotes a designer: "almost as reliable as em dashes" [V]; HN, Reddit [U] | State shown by text or icon |
| Pulsing "active" badges with no real state | [U] 3+ (heretic list, HN, Reddit) | Pulse only for data that is actually live |
| Stat banner rows, fake social proof | Krebs [V]; [U] Reddit 7/5 | Real numbers inside a sentence, or nothing |
| Second-generation look: cream + serif + terracotta; Space Grotesk, Fraunces, Instrument Serif, JetBrains / Plex Mono labels | Anthropic, Krebs [V]; [U] Reddit 10/8 | Matters here: fleeing purple tends to land on this |
| Tiny low-contrast text beside huge bold text; non-clickable things that look clickable | [U] 3 to 4 | Contrast floor; affordance only on controls |

**Visual, weak or dropped:** Inter alone (contested, mostly people quoting Anthropic); glassmorphism
(moderate, Reddit 11/5 with false matches); gradient text (4/3); bento (dropped, 0.1% in the
meta-analysis and defended); stock blob illustration (dropped, 5 mentions); centered hero alone
(pre-AI convention, only a tell in combination).

**Copy, supported:** rule of three [V]; "not just X, it's Y" [V]; spaced em dashes (Wikipedia now
lists them as historical 2022 to Sept 2026, and a July 2026 study it cites finds only Claude still
over-uses them) [V]; Title Case headings [V]; emoji bullets [V]; empty buzzwords (unlock, elevate,
seamless) [V] plus [U] Reddit 19/11; vague attribution [V]. Current word list (mid-2026, Wikipedia):
*leverage, foster, quietly, steady, practical, matters*; "delve" is outdated [V].
**Copy, dropped:** colon-led headings (no evidence); hedging (only documented for sourcing, not for
websites).

**Weighting** [V Krebs, U meta-analysis]: the signal is the cluster, not one feature. Krebs flags at
4+ patterns. "They all look the same" outweighs any single feature.

### A3. What users say

The repeated reports (3+ independent people each) are, in order of volume: purple and gradients;
the shadcn kit; eyebrow and all-caps labels; over-rounded uniform corners; dark mode with glow;
uniform shadows; glassmorphism; buzzword copy; em dashes; emoji icons; fade-up animation. Contested
by the same commenters: rounded corners, Inter, bento, glassmorphism, dark mode. Several posters note
these predate AI (the Bootstrap era). Sources: r/web_design 1wkwns6, r/webdesign 1we05wp and
1uhuovu, r/UX_Design 1v3tghy, r/ClaudeCode 1u7g0z5 (meta-analysis, author sells an "unslop" skill),
HN 47864393 and 49867038.

### A4. The fixation problem

- Anthropic calls it "distributional convergence": with no guidance a model lands on the same
  defaults, and when told to avoid one it moves to "a different local maximum" (its example: Space
  Grotesk). [V] claude.com/blog/improving-frontend-design-through-skills
- The current skill lists five clusters that have become signatures regardless of subject: cream +
  serif + terracotta; near-black + one acid accent; broadsheet hairlines + zero radius; the SaaS card
  kit; template chrome. [V]
- Website homogenization predates AI: Indiana University (CHI 2021) measured color and layout
  converging after a 2008 to 2010 peak in diversity. [U, coverage only, PDF not fetched]
- Frank Chimero, "The Web's Grain": do not draw the box until you know what goes in it. [V]

What varied, intentional design does [V sources above, applied as I]: structure encodes meaning (a
number marker only for real sequences); containers come from content; one planned motion moment;
type and color roles fixed before building. In A1 terms: Chimero's type-and-year tags, Appleton's
described content types, tonsky's type-derived spacing.

**Applied to this site [I]:** the current system already rejects many of these in writing (DESIGN.md
"What dies"). The drift is in the code: Tailwind violet hexes, violet-tinted surfaces, uppercase mono
labels, one ModuleSection rhythm on every module, a card on almost every data module. The fixation
here is "card + mono label + violet", repeated on every page.

---

## Appendix B: Design system (rewrite `apps/web/DESIGN.md`; keep its frontmatter format for the impeccable tool)

### Principles carried over (they hold up against the research)

- Purple means now: the accent has three jobs (live data, the one primary action per view, the focus
  ring). Unchanged.
- Color is imported: real data (language colors, game art, album art) is the only other source of
  hue. This rule now also removes the four invented hobby tile tones.
- Dark elevation = surface step, light elevation = shadow. Unchanged.
- Freshness is a rendered state. Unchanged.

### B1. Color tokens

Accent hue fixed at OKLCH h=293 (the current hue). Neutrals keep h=293 at chroma 0.004 to 0.025, so
they read as gray with a cast, not as purple. All values computed; contrast ratios measured with the
WCAG 2.x formula.

| Token (keeps current name where meaning is the same) | Dark | Light | Reason |
|---|---|---|---|
| `--surf-0` page | `#0e0e12` | `#f7f6f9` | Near-neutral ground; violet stops being the whole page |
| `--surf-1` card / raised | `#17161c` | `#fdfdff` | One step |
| `--surf-2` hover / selected | `#211f27` | `#ffffff` | One step |
| `--surf-3` the one anchor | `#2a2931` | `#f0eff4` (sunken in light) | One-anchor rule |
| `--ink` body | `#e8e7ee` | `#24222d` | 11.7:1 min dark, 13.7:1 min light |
| `--ink-strong` headings | `#fafafd` | `#12101a` | |
| `--muted` secondary | `#a8a5b6` | `#5e5b6d` | 5.97:1 on dark s3 (was 4.44, fail); 5.75:1 on light s3 |
| `--live` accent (dots, bars, non-text) | `#a487fa` | `#6738c1` | 5.09:1 min dark (was 3.30 on s3, fail as text) |
| `--live-ink` accent as text, focus ring | `#baa9fd` | `#5f2db7` | 6.97:1 min dark, 7.21:1 min light |
| `--live-solid` primary button fill | `#7a4fd9` | `#6738c1` | White on it: 5.32:1 dark, 7.21:1 light (was 4.71) |
| `--danger` / `--danger-ink` | `#f9786a` | `#af2b25` | 5.43:1 min dark, 5.75:1 min light |
| `--delta-up` | `#5ed8a9` | `#036f4f` | 8.13 / 5.41 min |
| `--line-1` decorative divider | `#26252c` | `#e1e0e6` | Hairline, not a control boundary |
| `--line-control` NEW input / control border | `#75727f` | `#868491` | 3.06:1 min dark, 3.41:1 min light (WCAG 1.4.11; old line-1 was 1.17) |
| `--heat-0..4` | `#211f27 #3f355e #5e4d92 #7f67c5 #a487fa` | `#e8e7ee #c5bde8 #a191dd #8063cf #6231ba` | Top step 6.36 / 7.75 vs card; even lightness steps |
| `--track` | = `--surf-2` | = `--line-1` | No separate value needed |

Removed: `--tile-*` gradients (invented palette), `--glow-live` except on the one live dot, the
dark `--sh-*` (already `none`). Kept as-is: brand colors (Spotify, YouTube, Twitch, Discord), GitHub
language colors, CMS `--stack-*` (CMS chart only). No `faint` text token: every candidate failed AA
on raised surfaces.

Note on "off Tailwind": the new accent (`#a487fa`) sits close to Tailwind violet-400 (`#a78bfa`)
because the hue is fixed. The hex is not what made the site read as default. Coverage is. The real
change is that violet leaves the surfaces and appears only where it has a job.

### B2. Type

Faces (all open-license, self-hosted through `@fontsource`, the current mechanism):

| Role | Face | Reason |
|---|---|---|
| Display: wordmark, page H1, section H2, big figures | **Archivo** (variable, width 62 to 125, weight) | Width axis lets long German words ("Datenschutzerklärung", "Wiedergabezeit") and big stat numbers fit without dropping size. A condensed heavy grotesque echoes scoreboard and HUD type, which fits a gaming handle without a costume font. Not on any slop-font list found. |
| Body and UI | **Atkinson Hyperlegible Next** | Designed for legibility (distinct I/l/1, 0/O). The site is mostly scanned stats and lists. Full German coverage. |
| Numbers that came from a sync | **Atkinson Hyperlegible Mono** | Same skeleton as the body, so mono stops looking like a costume. Used only for numbers and timestamps, never for labels. |

Availability of both Atkinson packages on fontsource rests on training data (released Feb 2025).
Step 2 verifies it before any change, and stops to ask if a package or tabular figures are missing.

Scale (public density), ratio about 1.25, fluid only at the top:

| Token | Value | Use |
|---|---|---|
| `--fs-meta` | 0.8125rem (13px) | Timestamps, captions. Was 11 and 12px. |
| `--fs-small` | 0.9375rem (15px) | Secondary lines in lists |
| `--fs-body` | 1.0625rem (17px) | Body. Was 15px, under the 16px floor. |
| `--fs-h3` | 1.25rem (20px) | Card and row titles |
| `--fs-h2` | clamp(1.5rem, 1.2rem + 1.2vw, 1.875rem) | Section headings (merges `--fs-section` and `--fs-h2`) |
| `--fs-h1` | clamp(2.25rem, 1.5rem + 3vw, 3.25rem) | Area page title |
| `--fs-display` | clamp(2.5rem, 1.6rem + 4vw, 4.25rem) | Home hero only, Archivo width 75, weight 700 |
| `--fs-figure` | clamp(2rem, 1.4rem + 2.5vw, 3rem) | Big stat numbers, Archivo, tabular |

Line height: display 1.0, headings 1.15, body 1.55. Measure: prose 66ch. Tracking: none on body;
display -0.01em. No uppercase tracked labels anywhere on the public site. CMS density keeps its own
smaller remap (`tokens.css` `.cms` block), values recomputed on the new scale.

### B3. Spacing

New 4px-based scale with large jumps between groups, after Chimero and tonsky: `--space-1` 4,
`-2` 8, `-3` 12, `-4` 16, `-5` 24, `-6` 32, `-7` 48, `-8` 64, `-9` 96 (px). Reason: the current
2px ramp (`--sp-2` to `--sp-24`, every 2px) has no steps big enough to separate groups, so every
gap reads the same. Old `--sp-*` tokens stay as aliases until Step 10 so no component breaks
mid-migration. Section rhythm has two values on purpose: `--space-7` (48) between related modules,
`--space-9` (96) before an unrelated group. Container: `.wrap` 1040px for data pages, 66ch column
for reading pages.

### B4. Radii

| Token | Value | Use |
|---|---|---|
| `--r-1` | 4px | Chips, tags, heat cells, inputs |
| `--r-2` | 6px | Buttons, controls, images |
| `--r-3` | 10px | Cards, the presence widget, modal |
| `--r-round` | 50% | Avatars and the live dot only |

Reason: the current 8/10/14/18 plus raw 9/11/12/15/16/24 values are both over-rounded and drifting.
Fredoka's rounded forms justified big radii; with a grotesque they no longer match. No pills except
round avatars and the dot.

### B5. Elevation and borders

Declare elevation once. Dark: surface step plus `--line-1`, no shadow. Light: resting cards use
`--line-1` only (no shadow); shadow `0 2px 6px rgb(18 16 26 / .08), 0 12px 32px rgb(18 16 26 / .10)`
only for things that float (modal, settings popover). Inputs and segmented controls use
`--line-control`. No colored border-left or border-top accents.

### B6. Motion

Tokens unchanged (`--dur-fast` 120ms, press 100ms, pulse 2.4s, `--ease-out`). Two jobs only:
1. **The keycap press** on buttons (existing ghost press with `translateY` and shadow compression),
   now on both variants. This is the one signature: it fits a gaming handle and it answers a touch.
2. **The live pulse** on the presence dot and fresh-sync dot, only while data is live (fixes the
   broken global `pulse`, see audit D10).
Panel switch fade stays (it marks a state change). No scroll entrance animations. Reduced motion:
unchanged behavior.

### B7. Component inventory (what the site needs, nothing more)

Shell: `AreaPage` (header, footer), `SiteChrome` (tabs, settings), `SettingsModal`.
Text: page title, section heading (`ModuleSection`, now with two variants: `plain` and `ruled`),
prose (global `.prose`, used by Bio, posts, legal, docs).
Data: figure (number + label), ranked row, heat grid and strip, language bars, event row, table row
(new CSS pattern for project and post lists, not a component library), segmented control, drill
panel, freshness marker.
Media: project screenshot, gallery tile, cover art.
Forms: `BaseForm` inputs, buttons (primary, secondary), contact form, guestbook form.
Containers: `ModuleCard` (kept, but used by at most two modules per page), presence widget.
Removed: hobby gradient tile, teaser box, round arrow badge, pinned badge as pill.

---

## Appendix C: Audit (write to `apps/web/DESIGN-AUDIT.md`, beside the system)

IDs are referenced by the plan. File refs from the 2026-11-18 code survey.

| ID | Where | Problem |
|---|---|---|
| D1 | `styles/tokens.css:24,48`, heat-4 | Accent values are exact Tailwind violet-500 `#8b5cf6`, violet-400 `#a78bfa`, violet-800 `#5b21b6`. DESIGN.md says the violet was "sampled off a real LED strip". The values say Tailwind default. |
| D2 | `tokens.css:77-80` | All four dark surfaces are violet-tinted (`#0e0c18` to `#2d2650`). The whole page reads purple: top user-reported tell. |
| D3 | `tokens.css`, `cms.css:2068`, `error.vue:60`, `BaseForm.vue`, `SegmentedControl.vue` | Contrast fails: dark `--live` as text 4.10 / 3.74 / 3.30 on surf-1/2/3; `--muted` on surf-3 4.44; `--line-1` as input border 1.17 (needs 3:1); white on `--live-solid` 4.71 (passes, thin margin). |
| D4 | `nuxt.config.ts:104-116`, `tokens.css:140-142` | Inter (weak tell) and Space Mono used as a "technical" costume. |
| D5 | `TeasersSection.vue:60`, `app.css:369`, `PresenceWidget.vue:369`, `SettingsModal.vue` | Uppercase tracked mono labels: template-chrome tell. |
| D6 | `tokens.css:144-155`, `StatTile.vue:92,99`, many | Body 15px under the 16px floor; meta 11/12px; `--fs-display` and `--fs-lede` unused; raw sizes 9, 10, 11.5, 13, 14, 17, 18, 20, 24, 34px off-scale. |
| D7 | `app.css:176`, tabs, toggle, brand mark, `HeroSection.vue:241`, gallery, modal | Radius drift: raw 9/11/12/15/16/24px beside 8/10/14/18 tokens. |
| D8 | `HeroSection.vue`, `seed.ts:45-47` | Hero: one accented word with a tilted underline bar (named tell); em dash in the H1; 8 stacked elements (avatar, H1, lede, status, presence line, synced, two buttons, "Wave" pill). |
| D9 | `HeroSection.vue:165,199`, `app.css:645` | `--glow-live` on three call sites; the rule says one. Pulsing status line even when nothing is live. |
| D10 | `app.css:646` | Bug: global `animation: pulse` points at a scoped (hashed) keyframe, so the freshness dot never pulses. |
| D11 | `HobbiesSection.vue`, `tokens.css:112-115,242-245` | Four invented gradient tones in a 4-column identical tile grid. Breaks the system's own imported-color rule. |
| D12 | `TeasersSection.vue` | Auto-fit grid of identical boxes (label, value, detail): stat-banner tell. |
| D13 | Activity, Coding, Playtime, Music, Wrapped, Presence sections | Six modules in `ModuleCard`. Life renders four card sections in a row: section-layout repetition. |
| D14 | `ui/ModuleSection.vue:55-58` | Every module gets the same heading row and the same 52px gap. No rhythm difference between related and unrelated sections. |
| D15 | `app.css:246-256`, `tokens.css:237-238` | Light mode card has border and shadow at rest: ghost card. |
| D16 | Featured, Glance, Projects links | `→` appended to links ("see all my work →", "full activity →"), round arrow badges on cards. |
| D17 | `shell/AreaPage.vue:90-94` | Footer `last synced · @handle · Docs · Privacy`: middle-dot string. |
| D18 | `AreaPage.vue` header | Brand mark "D" in a 30px rounded tinted square: generic lettermark. |
| D19 | `seed.ts:50,56,60-61,64,79-100,115`, `lib/site-meta.ts:18-20`, `ui-messages.ts`, `nuxt.config.ts:121` | Copy: "by day / by night" construction three times; "genuinely", "quietly" (current AI word list); four hobby blurbs as a matched set; em dashes in H1, bio, now items, empty states, page title. |
| D20 | `SettingsModal.vue:140-141` | `backdrop-filter: blur(4px)` on the overlay: decoration, not meaning. (Docs top bar blur at `app.css:510` stays: chrome over content.) |
| D21 | `pages/md/[...slug].vue`, `datenschutz.vue` | Bug: `.prose` has no global styles; blog posts are unstyled; legal page uses inline styles. |
| D22 | `error.vue` | German only while the site defaults to English. (`datenschutz.vue` German only is acceptable for a German legal text; leave it.) |
| D23 | `styles/cms.css:26` | Bug: `--cms-font-value: var(--cms-font-value)` refers to itself; CMS values lose their mono face. Touched because the font swap changes this token. |
| D24 | `PresenceWidget.vue:183,215,357` | Gradient washes on the widget and avatars. |
| D25 | `FeaturedSection.vue` | Card kit: screenshot, round arrow, language chip, "Pinned" pill, 3-line clamp, identical cells. |
| D26 | Media queries 720/680/560/520 | No breakpoint system; four nearby values. |

---

## Plan (steps; each step is one or more commits that pass all gates and ship)

Rules for every step: run `node scripts/dev-up.mjs --id redesign`, check the touched pages at 1280px
and 390px in light and dark, then `node scripts/dev-down.mjs --id redesign`. Gates at the end of each
step: `pnpm lint:nav`, `pnpm --filter web lint:tokens`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
Conventional Commits, to main.

Non-design code touched, with the reason:
- `package.json` (web) and `nuxt.config.ts`: swap `@fontsource` packages. The type system cannot work without the files.
- `packages/db/src/seed.ts`, `packages/core/src/ia.ts`, `packages/core/src/ui-messages.ts`, `apps/web/src/lib/site-meta.ts`, `apps/web/src/data/fallback-site.json`, `nuxt.config.ts` title: this is where the copy lives. No schema change.
- No schema change for the hero highlight: `headline.highlight` stays in the data; only its rendering changes.

**Step 0. Write the deliverables into the repo.** Files: `docs/research/2026-11-18-redesign-research.md`
(Appendix A), `apps/web/DESIGN.md` (rewrite from Appendix B, keep frontmatter shape),
`apps/web/DESIGN-AUDIT.md` (Appendix C), `docs/plans/2026-11-18-redesign.md` (this plan, if the hook
did not write it). Commit: `docs: add redesign research, system, and audit`. Resolves: none.

**Step 1. Color tokens.** Files: `styles/tokens.css` (values per B1, add `--line-control`, drop
`--tile-*` only after Step 7, keep names), `cms.css:2068` and `error.vue:60` (`--live` to `--live-ink`
for text), `BaseForm.vue` and `SegmentedControl.vue` (borders to `--line-control`). Resolves D1, D2,
D3. Ships as a pure palette shift.

**Step 2. Type.** Verify fontsource packages first (stop and ask if missing). Files: web
`package.json`, `nuxt.config.ts:104-116`, `tokens.css:140-155` (faces, scale per B2), `app.css`
(H1 rule at :156-164 to tokens; remove uppercase and tracking at :369), `TeasersSection.vue`,
`PresenceWidget.vue`, `SettingsModal.vue` (labels to sentence case, body face), `StatTile.vue` and
other raw sizes to tokens, `cms.css:26` (fix self-reference), `.cms` type remap. Resolves D4, D5, D6,
D23.

**Step 3. Shape, elevation, motion.** Files: `tokens.css` (radii and spacing per B3, B4; old names
alias), `app.css` (buttons, cards: light ghost card off, keycap press on both button variants, global
`@keyframes pulse`), `HeroSection.vue` (remove scoped pulse, glow to the live dot only),
`SettingsModal.vue` (no blur, solid scrim), all raw radii to tokens. Breakpoints consolidated to two
custom-media-free values (560, 860) in touched files. Resolves D7, D9, D10, D15, D20, D26.

**Step 4. Shell.** Files: `shell/AreaPage.vue` (wordmark "Domenic" set in Archivo instead of the
lettermark square; footer as two plain lines: freshness sentence, then links), `SiteChrome.vue` (tab
strip: underline for selected instead of filled pill, still ink vs muted, no accent),
`ui/ModuleSection.vue` (two variants: `plain` heading, `ruled` heading with a top rule; prop chosen
per module; section gap from B3). Resolves D14, D17, D18.

**Step 5. Home.** Layout families: text block, index list, single figure, asymmetric feature,
running quote column. Each appears once.
- `HeroSection.vue`: left-aligned text block at 66ch. Max four elements: H1, lede, one status line
  (only rendered when live or recently synced), one button row (primary "Contact", secondary
  "GitHub"). Avatar moves inline beside the H1 at small size. Highlight word rendered as plain text.
  "Wave" stays a feature but becomes a text button in the status line. Resolves D8.
- `TeasersSection.vue`: ruled index list, one row per area: name, one-line description, count
  right-aligned in mono figures. Resolves D12.
- `GlanceSection.vue`: one large figure plus the latest-event sentence; the StatGrid drops to inline
  figures. Link text names the target ("All activity"). Resolves D16 (part).
- `FeaturedSection.vue`: first project large (screenshot left 55%, text right), others as compact
  rows below. Language as plain text with its color dot, "Pinned" as plain meta text, no round arrow.
  Resolves D25, D16 (part).
- `GuestbookSection.vue`: entries as a single running column of quotes with name and date below, no
  cards; form in a bordered panel beside it on wide screens.

**Step 6. Code page.** Operate density; wide container. Families: figure row, full-bleed heatmap,
dated list, table.
- `ActivitySection.vue`: four figures in one ruled row (no card); heatmap full width without a card;
  language bars beside it; event feed as a dated list with the date in a left gutter column.
- `CodingSection.vue`: the one `ModuleCard` on this page (the anchor), bars inside.
- `ProjectsSection.vue` + `ui/ProjectCard.vue`: table-like rows (name, description, language,
  updated), pinned rows first with a screenshot thumbnail. Same data as today.
Resolves D13 (Code), D16.

**Step 7. Life page.** The page where imported color (game art, album art, language colors) carries
the page; chrome stays neutral. Families: anchor widget, ranked lists with art, poster, list, varied
grid, key-value list.
- `PresenceWidget.vue`: kept as the page anchor (`--surf-3`), gradients removed, flat surface. D24.
- `PlaytimeSection.vue`, `MusicSection.vue`: no card wrapper; figures row, heat strip, ranked list
  with cover art at 48px and tabular numbers. Only one of these two uses `ModuleCard` (Playtime's
  weekday by hour heatmap).
- `WrappedSection.vue`: the one Experience moment, Feltron-like poster: large Archivo figures,
  ranked lists in columns, no card. Allowed one stronger type scale (`--fs-figure` up to display).
- `HobbiesSection.vue`: plain two-column list (icon, title, blurb), no tiles, no tone colors. Then
  remove `--tile-*` from tokens. `tone` stays in the data, unused. D11.
- `GallerySection.vue`: first image spans two columns, captions below the frame.
- `NowSection.vue`: key-value list (already right), new type only.
Resolves D11, D13 (Life), D24.

**Step 8. Reading surfaces.** Read mode: 66ch, 17px body, no cards.
- Global `.prose` in `app.css` (moved out of `BioSection.vue` scope), used by `BioSection.vue`,
  `pages/md/[...slug].vue`, `datenschutz.vue` (inline styles removed), docs body.
- `ContactSection.vue`, `ContactForm.vue`: plain email link plus form; labels above inputs.
- `PostsSection.vue`: list with title, date and tags as one meta line, no middle-dot chains.
- `error.vue`: strings to `ui-messages.ts` in EN and DE.
Resolves D21, D22.

**Step 9. Copy.** Files: `seed.ts`, `ia.ts` headings, `ui-messages.ts` (EN and DE), `site-meta.ts`,
`fallback-site.json`, `nuxt.config.ts:121`. Plus `docs/research/2026-11-18-copy-sheet.md`: the same
strings for the owner to paste into the production CMS, because seed edits do not change the live
database. Drafts below; every fact is from the current copy, nothing added. Owner approves wording
before commit. Resolves D19.

| Slot | Current | Draft EN | Draft DE |
|---|---|---|---|
| H1 | I build for the web [em dash] and *tinker* after hours. | I build websites. After work I build everything else. | Ich baue Websites. Nach Feierabend baue ich den Rest. |
| Lede | Full-time web developer, Fachinformatiker Anwendungsentwicklung. Clean, usable interfaces by day; plant sensors and LED strips by night. | Full-time web developer, trained as a Fachinformatiker Anwendungsentwicklung. Outside work: plant sensors, LED strips, and a home lab. | Webentwickler in Vollzeit, gelernter Fachinformatiker Anwendungsentwicklung. Nach der Arbeit: Pflanzensensoren, LED-Streifen und ein Home Lab. |
| Bio 1 | ...making interfaces that are genuinely pleasant to use. | ...Most of my day goes into interfaces that are easy to use. | ...Den größten Teil des Tages baue ich Oberflächen, die sich leicht bedienen lassen. |
| Bio 2 | ...Raspberry Pi nearby [em dash] usually attached to... | ...Raspberry Pi nearby, usually attached to a plant, an LED strip, or a corner of my home lab that did not need automating. | ...Raspberry Pi in Reichweite, meistens an einer Pflanze, einem LED-Streifen oder einer Ecke im Home Lab, die man nicht hätte automatisieren müssen. |
| Bio 3 | ...a backend quietly accumulates data from GitHub... | This site is a project too. A small CMS I wrote holds the text, and a backend pulls data from GitHub (and whatever I connect next), so the pages stay current without me. | Diese Seite ist auch so ein Projekt. Ein kleines, selbstgeschriebenes CMS hält die Texte, ein Backend holt Daten von GitHub (und was ich als Nächstes anschließe), damit die Seiten ohne mich aktuell bleiben. |
| Now: building | plantcare-tracker [em dash] watering schedules | plantcare-tracker (watering schedules) | plantcare-tracker (Gießpläne) |
| Hobby blurbs | four matched taglines | Keep the four facts, vary the form: "Gaming: where the name comes from." "Houseplants: I stopped counting." "LEDs and Pi: lights that react to things." "Home lab: automating the boring bits." | entsprechend |
| Page title | Domenic [em dash] web dev & tinkerer | Domenic, web developer | Domenic, Webentwickler |
| Meta description | (by day / by night) | Domenic's homepage: code, games, music, and side projects, updated from GitHub, Wakapi and Discord. | Domenics Homepage: Code, Spiele, Musik und Nebenprojekte, aktualisiert aus GitHub, Wakapi und Discord. |
| Empty state | Nothing synced from GitHub yet [em dash] check back shortly. | Nothing from GitHub yet. The next sync runs soon. | Noch nichts von GitHub. Der nächste Sync läuft bald. |
| Headings | Jump in, Stuff I make, Off the clock, Snapshots | Areas, Projects, Hobbies, Photos (plain functional labels) | Bereiche, Projekte, Hobbys, Fotos |

Rule for all remaining strings: no em or en dashes, sentence case, no stock adverbs from A2, one
label per intent ("Contact" everywhere, not "Get in touch" / "Email me" / "Send message" for the
same intent; the submit button may say "Send").

**Step 10. Cleanup and docs.** Remove `--sp-*` and old radius aliases after a grep shows no users;
remove `--fs-section`, `--fs-lede`; update `cms.css` legacy aliases block (`tokens.css:296-317`) to
the new values; update `docs/concepts/design-system.md` where its values conflict with DESIGN.md
(link to DESIGN.md as the source of values). Run the checklist below and record results in
`DESIGN-AUDIT.md` (each D-item marked resolved with commit hash).

### Where layout deliberately differs

- Home: editorial text block, index list, one big figure, asymmetric feature, quote column.
- Code: dense data, wide container, figure row, full-bleed heatmap, table rows, one card.
- Life: imported color leads, one anchor widget, poster (Wrapped), varied gallery.
- About and posts: single reading column, no containers.
- No layout family appears twice on one page; at most two `ModuleCard` per page; section gaps vary
  between 48 and 96px by relation.

### Finished-redesign checklist (each item is a check, not a judgment)

1. Accent count: violet appears only on live data, one primary button per view, focus ring. Grep for
   `--live` consumers and review each.
2. No surface token has OKLCH chroma above 0.02.
3. Contrast script passes: all text pairs at least 4.5:1 (large text 3:1), control borders and focus
   ring at least 3:1, both themes.
4. Zero uppercase or letter-spaced labels on public pages (grep `text-transform: uppercase`,
   `letter-spacing` greater than 0 in `apps/web/src` outside `cms`).
5. Zero `→` appended to link text; zero em or en dashes in `seed.ts`, `ia.ts`, `ui-messages.ts`,
   `site-meta.ts`, rendered pages.
6. No raw `px` radius or font-size that equals a token (`lint:tokens` passes); no radius above 10px
   except round avatars and dots.
7. No element has both a border and a box-shadow at rest.
8. Exactly one animated pulse, and it only renders when the data is live.
9. No scroll-triggered entrance animation exists.
10. No `backdrop-filter` outside the docs top bar.
11. Body text is 17px, measure at most 66ch on reading pages.
12. Each page: no layout family repeats; at most two `ModuleCard`; at most one eyebrow-like label.
13. Hero has at most four text elements; H1 fits two lines at 1280px in EN and DE.
14. Squint test at 1280px on each area page: primary, secondary, and groups are nameable in order.
15. Cover-the-name test: home first viewport says something only true of this person (the facts
    from the lede are visible).
16. Every state renders: fresh, stale, empty, failed, never, for each synced module (dev-up seeds
    them; force empty and failed through the CMS).
17. German pass: no overflow in buttons, headings, tabs at 390px.
18. Copy grep for AI word list (leverage, foster, quietly, steady, seamless, elevate, unlock,
    genuinely) returns nothing.
19. Krebs pattern count: run the page through slopcop.adriankrebs.ch (or its 16 patterns by hand):
    3 or fewer matches.
20. Reduced motion and keyboard focus work on every interactive element.

## Verification

Per step: dev session (`dev-up` / `dev-down`, id `redesign`), screenshots at 1280 and 390 in both
themes of each touched page, the gates listed above. At Step 10: the full checklist, results written
into `DESIGN-AUDIT.md`. Contrast is checked with a small Node script in the scratchpad (not
committed) using the WCAG 2.x formula on the final token values.

## Risks and my disagreements

- **Keeping violet keeps the top tell in play.** The accent-only scope limits the damage by
  coverage, but a dark page with a violet accent still sits near the "dark + one accent" cluster.
  The real mitigation is that violet only shows on live data, so most screens have very little.
- **Replacing all three faces is the riskiest choice here.** It changes identity more than any
  other step and risks landing on the next default. Archivo and Atkinson are chosen for reasons tied
  to this site (German word length, scanned numbers), not for trend. If either package is missing
  on fontsource, Step 2 stops.
- **The written system already banned most of these tells, and the code drifted anyway.** Without
  enforcement it will drift again. `lint:tokens` covers raw values; the checklist greps are cheap to
  rerun. Consider wiring checklist items 4, 5 and 10 into a lint later (build tooling, so out of
  scope here).
- **Production copy lives in the CMS database.** Seed edits only reach fresh installs. The owner has
  to paste the copy sheet into the CMS; otherwise Step 9 changes nothing visible on the live site.
- **Effort is underestimated if read as "a restyle".** Steps 5 to 7 rebuild 15 section components.
  Expect each page step to be its own session.

## Progress and deviations

- Step 0 done (47d3b75). Deviation: plan file is the hook-written one in this folder, not `docs/plans/2026-11-18-redesign.md`.
- Step 1 done. Deviations, with reasons:
  - `--line-2` (emphasized divider) is not in the B1 table. Set to neutral `#3a3842` (dark) and `#c9c8d1` (light). Reason: the old value was a violet rgba, and hover edges must not use the accent.
  - `--danger-ink` and `--delta-down` on dark equal `--danger` (`#f9786a`). Reason: B1 lists one value, and it passes 5.43:1 on every surface.
  - `error.vue` `.code` moved to `--live-ink` as planned. It is not live data, so Step 8 should re-check it against "purple means now".
  - `.seg` border in `SegmentedControl.vue` uses `--line-control` (it is the control's only edge).
  - Not changed: `public/favicon.svg` (gradient stop `#a78bfa`) and CMS `--stack-3`. Reason: out of Step 1 scope. The favicon needs a decision in Step 4.
  - Mobile (390px) visual check skipped for Step 1: a palette-only change. Desktop dark and light checked.
  - Added audit finding D27.
- Step 2 done. Deviations, with reasons:
  - Fontsource packages verified: `@fontsource-variable/archivo` (wdth.css has weight 100 to 900 and width 62% to 125%), `@fontsource-variable/atkinson-hyperlegible-next` and `-mono` (weight 200 to 800), all 5.3.0. Tabular figures verified in the browser for Atkinson Next (proportional "1111" 27.7px, tabular 43.0px, equal to "0000").
  - Variable packages used instead of static `@fontsource/*`. Family names: "Archivo Variable", "Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Mono Variable".
  - Body 17px is set on `body`. `.cms` gets `font-size: 1rem` so the CMS keeps its old 16px base. `.cms` also overrides `--fs-small` (13px) and `--fs-h1` (22px).
  - D6 is only partly resolved. Done: tokens, `body`, `h1`, `app.css`, and every 13px and 14px raw size outside the CMS mapped 1:1 to `--fs-meta` and `--fs-small`. Not done: the odd sizes (9, 10, 11.5, 15.5, 16, 17, 18, 20, 22, 24, 34, 48px) in `StatTile`, `PresenceWidget`, `PlaytimeSection`, `HeatGrid`, `FeaturedSection`, `HobbiesSection`, `ProjectCard`, `SettingsModal`, `BioSection`. Reason: those components are rebuilt in Steps 5 to 7, so each takes its tokens there. Step 10 runs a final sweep.
  - `--fs-micro` and `--fs-section` stay as aliases (to `--fs-meta` and `--fs-h2`) until Step 10. `--fs-lede` removed (no consumers).
  - Mono is not yet limited to numbers. Only `.more`, `.sub`, `.tag` and the five formerly uppercase labels moved to the body face. The remaining mono labels move with their sections in Steps 5 to 8.
  - Uppercase kept in `FeaturedSection.vue` (single placeholder letter), removed from the five label rules.
  - Bug found and fixed because the larger type exposed it: at 390px `/code` overflowed by 11px. `CardHeader.vue` now wraps, and the mobile `.dash` track is `minmax(0, 1fr)`.
  - `.impeccable/design.json` is stale (describes the old system). Not touched. Regenerating it is a tool step for the owner (`/impeccable document`).
  - Checked: desktop at 1280px and iframes at 390px for four routes in EN and DE (no overflow), fonts loaded, H1 on two lines.
- Step 3 done. Deviations, with reasons:
  - Radius scale (4/6/10) is applied through the old token names as aliases, so unchanged components follow. CMS remap is now anchor 10, card 6, control 4, chip 4 (one step down).
  - Breakpoints are 560 and 720, not 560 and 860 as the plan said. Reason: 680 and 720 merge cleanly, and 860 would change the layouts that break at 680. Recorded in DESIGN.md.
  - Settings switch track stays fully round (documented exception in DESIGN.md).
  - HeatGrid 2px cell radius and the presence equalizer bars (1.5 to 2px) are left as they are.
  - Hero status dot (CMS text, not live data) is now static and muted; glow stays only on the live presence dot. The fresh-sync dot keeps the pulse, no glow.
  - Hero avatar radius is now round (plan: avatars are round). The dev data has no avatar, so this is unchecked in the browser.
  - Primary and ghost buttons share one keycap: a 4px solid edge, 3px press. The ambient shadow layer on the ghost button is gone.
  - Light-mode `.card:hover` no longer adds a shadow; hover is border and surface only.
  - Incident: a scripted radius mapping rewrote `b` as `o` in 11 files (a PowerShell array unrolling bug). Found from a file-change notice, restored with `git checkout -- <those files>` (they held no other uncommitted work), mapping redone, diff reviewed. Lesson: review `git diff --stat` after every scripted edit.
- Step 4 done. Deviations, with reasons:
  - `ModuleSection` gets `variant` (plain, ruled) and `gap` (related 48px, group 96px) props, default plain and related. No module sets them yet. Reason: each section is rebuilt in Steps 5 to 7, and the choice per module belongs with each layout. The old 52px gap is now 48px for every module.
  - Footer sync line uses the hero's relative message (`freshFresh`, "synced 1m ago") instead of the raw ISO timestamp the old footer printed. It hides when there is no sync time. `lastSynced` stays in the catalog, now unused (Step 9 removes it).
  - Wordmark is the name only, in Archivo at width 75. Lettermark square removed.
  - Favicon: gradient replaced by a flat `#7a4fd9` square with the same "D" glyph. `public/og-image.png` is a raster and not regenerated; it likely still carries the old look. Owner decision: replace it with a new export.
  - `.chrome` gap is 16px so the tabs do not touch the settings button.
  - Checked: 1280px (DE) header and footer, 390px overflow for four routes in EN and DE, footer content and links.
