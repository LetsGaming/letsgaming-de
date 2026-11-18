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
| D6 | partial (Step 2) | `tokens.css:144-155`, `StatTile.vue:92,99`, many | Body 15px (under the 16px floor). Meta 11 and 12px. `--fs-display` and `--fs-lede` unused. Raw sizes 9, 10, 11.5, 13, 14, 17, 18, 20, 24, 34px off the scale. |
| D7 | open | `app.css:176`, tabs, toggle, brand mark, `HeroSection.vue:241`, gallery, modal | Radius drift: raw 9/11/12/15/16/24px beside the 8/10/14/18 tokens. |
| D8 | open | `HeroSection.vue`, `seed.ts:45-47` | Hero: one accented word with a tilted underline bar (named tell); em dash in the H1; 8 stacked elements (avatar, H1, lede, status, presence line, synced, two buttons, "Wave" pill). |
| D9 | open | `HeroSection.vue:165,199`, `app.css:645` | `--glow-live` has three call sites; the rule says one. The status line pulses even when nothing is live. |
| D10 | open | `app.css:646` | Bug: global `animation: pulse` points at a scoped (hashed) keyframe, so the freshness dot never pulses. |
| D11 | open | `HobbiesSection.vue`, `tokens.css:112-115,242-245` | Four invented gradient tones in a 4-column identical tile grid. Breaks the system's own imported-color rule. |
| D12 | open | `TeasersSection.vue` | Auto-fit grid of identical boxes (label, value, detail): stat-banner tell. |
| D13 | open | Activity, Coding, Playtime, Music, Wrapped, Presence sections | Six modules in `ModuleCard`. Life renders four card sections in a row: section-layout repetition. |
| D14 | open | `ui/ModuleSection.vue:55-58` | Every module gets the same heading row and the same 52px gap. No rhythm difference between related and unrelated sections. |
| D15 | open | `app.css:246-256`, `tokens.css:237-238` | Light-mode card has border and shadow at rest: ghost card. |
| D16 | open | Featured, Glance, Projects links | `→` appended to link text ("see all my work →", "full activity →"); round arrow badges on cards. |
| D17 | open | `shell/AreaPage.vue:90-94` | Footer `last synced · @handle · Docs · Privacy`: middle-dot string. |
| D18 | open | `AreaPage.vue` header | Brand mark "D" in a 30px rounded tinted square: generic lettermark. |
| D19 | open | `seed.ts:50,56,60-61,64,79-100,115`, `lib/site-meta.ts:18-20`, `ui-messages.ts`, `nuxt.config.ts:121` | Copy: "by day / by night" construction three times; "genuinely" and "quietly" (current AI word list); four hobby blurbs as a matched set; em dashes in H1, bio, now items, empty states, page title. |
| D20 | open | `SettingsModal.vue:140-141` | `backdrop-filter: blur(4px)` on the overlay: decoration, not meaning. The docs top bar blur at `app.css:510` stays: chrome over content. |
| D21 | open | `pages/md/[...slug].vue`, `datenschutz.vue` | Bug: `.prose` has no global styles, so blog posts are unstyled; the legal page uses inline styles. |
| D22 | open | `error.vue` | German only while the site defaults to English. (`datenschutz.vue` stays German: German legal text.) |
| D23 | resolved (Step 2) | `styles/cms.css:26` | Bug: `--cms-font-value: var(--cms-font-value)` refers to itself; CMS values lose their mono face. Touched because the font swap changes this token. |
| D24 | open | `PresenceWidget.vue:183,215,357` | Gradient washes on the widget and avatars. |
| D25 | open | `FeaturedSection.vue` | Card kit: screenshot, round arrow, language chip, "Pinned" pill, 3-line clamp, identical cells. |
| D26 | open | Media queries 720/680/560/520 | No breakpoint system; four nearby values. |
| D27 | open | `SegmentedControl.vue` (selected option), range note in `PlaytimeSection.vue` and siblings | Accent used for a selected state and for a static range label. Breaks "purple means now". Found while checking Step 1 in the browser. Resolve in Steps 6 and 7 with the section rebuilds. |

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
