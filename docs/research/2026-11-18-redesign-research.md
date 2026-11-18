# Redesign research (2026-11-18)

Goal: a professional site that does not read as AI-generated. These are findings, not opinions.

Markers: **[V]** verified from a primary source. **[U]** reported by users (count = distinct people / threads). **[I]** my inference.

Counts come from regex over 570 Reddit comments (369 people, 16 threads, read through the pullpush.io archive, because Reddit blocked direct fetching) and about 1,380 Hacker News items. Treat them as rough.

## 1. What professional looks like now

Nine live sites, fetched 2026-11-18. HTML and CSS were read; the sites were not rendered. Statements about motion come from CSS.

| Site | Mechanism |
|---|---|
| tonsky.me | One family (IBM Plex Sans). Size derived from cap height; gap = cap height; radius = cap height / 3. 575px column. Saturated yellow `#FDDB29` ground. Every gray is black at an opacity (0.4 text, 0.2 lines, 0.06 fills), so nothing competes with the one color. Posts grouped under year headings. [V] |
| rsms.me | Inter and InterDisplay only. Every dimension is a multiple of one `--unit`. Chrome is white; color lives on individual project tiles (display-p3 mint, pink, brown), so color belongs to content. [V] |
| gwern.net | Source Serif 4 body at 20px, 935px max. Pure grayscale, no accent hue. Depth comes from structure (sidenotes, popups, backlinks), not decoration. [V] |
| stephango.com | System stack, heading weight 500, fluid body `calc(1.5rem + .25vw)`. Two widths (37em, 54em). Radius 4px, images 6px. One yellow highlight token. Home is the latest post, then a flat topic list. Has a /now page. [V] |
| lynnandtonic.com | Two committed display faces; sizes jump from 1.2rem to 6rem. Three color tokens, swapped with `light-dark()`. Versioned site ("v. XIX"). [V] |
| frankchimero.com | One 36rem column. Spacing steps 0.25/0.5/1/1.5/4/6rem: big jumps between groups. 8 hex values, one muted green-gray accent. Works listed with type and year ("Essay · 2025"); metadata classifies, no cards. [V] |
| paco.me | 640px content inside a 1072px grid, 128px top offset. 11-step neutral scale. Reduced motion handled; experiments kept in a separate /craft section. [V] |
| maggieappleton.com | Serif display and body, Lato UI, Plex Mono code. Several named accents (the exception). Each nav item carries a one-line description of its content type. 12 images on the home page. [V] |
| feltron.com | Personal annual data reports. Site chrome is gray only (`#f8f8f8`, `#333`, `#999`, `#ccc`), so the report images are the only color. Directly relevant to Wrapped and music stats. [V] |

Also live, weaker evidence: rauno.me (9-step px scale, yearly archives), emilkowal.ski (one accent `#fad657` on a 12-step gray scale), leerob.com (shadcn-style tokens).

Patterns [I]:

- 7 of 9 use zero or one accent.
- The text column is fixed between about 575 and 935px.
- Several derive spacing from the type.
- Hierarchy comes from content metadata (year, type, description), not from card containers.
- None uses an eyebrow label system or a card grid as its main structure.

## 2. AI tells, catalogued

Primary sources: Anthropic frontend-design SKILL.md [V] (github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md). Adrian Krebs, 1,590 Show HN pages scanned against 16 patterns, 22% match 4 or more [V] (adriankrebs.ch/blog/design-slop). Wikipedia "Signs of AI writing" [V].

### Visual, supported

| Tell | Evidence | Alternative |
|---|---|---|
| Purple / indigo, purple-to-blue gradient | Strongest single tell. Anthropic (older text), Krebs. [U] Reddit 38/13, HN 40/38. Traced to the Tailwind UI `indigo-500` default. | Color from the subject; flat fills; accent used rarely |
| Untouched shadcn / Tailwind look | Krebs; r/ClaudeCode meta-analysis #1. [U] Reddit 12/11, HN 39/43 | Own spacing and radius tokens |
| Identical cards, everything in a card | Anthropic, Krebs | Layout matches importance: list, table, prose, one big plus small |
| One radius everywhere | Anthropic. [U] Reddit 31/12, contested | Radius by role |
| Uniform soft shadow, colored glow | Anthropic, Krebs. [U] Reddit 13/8 | Border or contrast; elevation only for floating things |
| Fade-up on scroll, hover on every card | Anthropic. [U] Reddit 4/4; HN calls it the most annoying | One authored moment; motion answers user action |
| Dark mode with neon glow | Krebs. [U] Reddit 14/11 | Theme chosen for the use; no decorative glow |
| Emoji as icons | Krebs, Wikipedia. [U] Reddit 7/5, HN about 32 | One icon set or none |
| Eyebrow pill above H1, all-caps section labels | Anthropic, Krebs. [U] Reddit 25/10 (third most mentioned) | Plain heading hierarchy |
| One accented word in the headline | Anthropic [V] | Solid headline; emphasis from what it says |
| Template chrome: `A · B · C` meta strings, mono data labels, `→` on links | Anthropic [V] | Metadata in plain text; links named by destination |
| Colored left or top border on cards | Krebs quotes a designer: "almost as reliable as em dashes" [V]; HN, Reddit [U] | State shown by text or icon |
| Pulsing "active" badges with no real state | [U] 3 or more (heretic list, HN, Reddit) | Pulse only for data that is actually live |
| Stat banner rows, fake social proof | Krebs [V]; [U] Reddit 7/5 | Real numbers inside a sentence, or nothing |
| Second-generation look: cream + serif + terracotta; Space Grotesk, Fraunces, Instrument Serif; JetBrains or Plex Mono labels | Anthropic, Krebs [V]; [U] Reddit 10/8 | Matters here: fleeing purple tends to land on this |
| Tiny low-contrast text beside huge bold text; non-clickable things that look clickable | [U] 3 to 4 | Contrast floor; affordance only on controls |

### Visual, weak or dropped

- Inter alone: contested, mostly people quoting Anthropic.
- Glassmorphism: moderate; Reddit 11/5 includes false matches ("magnifying glass").
- Gradient text: 4/3.
- Bento grid: dropped. 0.1% in the meta-analysis and defended by people who complain about AI design.
- Stock blob illustration: dropped. 5 mentions.
- Centered hero alone: pre-AI convention. Only a tell in combination.

### Copy, supported

- Rule of three [V].
- "Not just X, it's Y" [V].
- Spaced em dashes [V]. Wikipedia now files them under "historical indicators (2022 to Sept 2026)". A July 2026 study it cites finds only Claude still over-uses them.
- Title Case headings [V].
- Emoji bullets [V].
- Empty buzzwords (unlock, elevate, seamless) [V], plus [U] Reddit 19/11.
- Vague attribution [V].
- Current word list (mid-2026, Wikipedia): *leverage, foster, quietly, steady, practical, matters*. "delve" is outdated [V].

### Copy, dropped

- Colon-led headings: no evidence found.
- Hedged claims: documented only for sourcing, not for websites.
- Uniform confident register: [I] only.

### Weighting

The signal is the cluster, not one feature. Krebs flags a page at 4 or more patterns [V]. The r/ClaudeCode meta-analysis found "they all look the same" outweighs any single feature [U]. The author of that analysis sells an "unslop-ui" skill, so there is possible bias.

## 3. What users say

Repeated reports (3 or more independent people), in order of volume: purple and gradients; the shadcn kit; eyebrow and all-caps labels; over-rounded uniform corners; dark mode with glow; uniform shadows; glassmorphism; buzzword copy; em dashes; emoji icons; fade-up animation.

Contested by the same commenters: rounded corners, Inter, bento, glassmorphism, dark mode. Several posters note these predate AI (the Bootstrap era).

Sources: r/web_design 1wkwns6; r/webdesign 1we05wp and 1uhuovu; r/UX_Design 1v3tghy; r/ClaudeCode 1u7g0z5; HN items 47864393 and 49867038.

## 4. The fixation problem

- Anthropic calls it "distributional convergence". With no guidance a model lands on the same defaults. When told to avoid one, it moves to "a different local maximum" (its example: Space Grotesk). [V] claude.com/blog/improving-frontend-design-through-skills
- The current skill lists five clusters that became signatures regardless of subject: cream + serif + terracotta; near-black + one acid accent; broadsheet hairlines + zero radius; the SaaS card kit; template chrome. [V]
- Website homogenization predates AI. Indiana University (CHI 2021) measured color and layout converging after a 2008 to 2010 peak in diversity. [U] Coverage only; the PDF was not fetched.
- Frank Chimero, "The Web's Grain": do not draw the box until you know what goes in it. [V]

What varied, intentional design does [V sources above, applied as I]:

- Structure encodes meaning (a number marker only for a real sequence).
- Containers come from content.
- One planned motion moment.
- Type and color roles fixed before building.

In section 1 terms: Chimero's type-and-year tags, Appleton's described content types, tonsky's type-derived spacing.

Applied to this site [I]: the written system (`apps/web/DESIGN.md`, `docs/concepts/design-system.md`) already rejects many of these tells. The drift is in the code: Tailwind violet hexes, violet-tinted surfaces, uppercase mono labels, one `ModuleSection` rhythm on every module, a card on almost every data module. The fixation here is "card + mono label + violet", repeated on every page.

## Limits of this research

- Site observations are from source, not renders.
- Reddit was read through an archive; counts are regex-based.
- The Boris Müller essay (2018) could not be fetched (Medium returned 403) and is not used.
- Availability of the planned font packages is not checked here. See the design system doc and plan Step 2.
