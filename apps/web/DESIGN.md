---
name: letsgaming.de
description: A self-updating personal homepage built as a violet room, lit by one bright violet signal that means "happening right now."
colors:
  shelf-violet: "#c08eff"
  shelf-violet-solid: "#833ac9"
  live-ink: "#d2b3fe"
  alarm-coral: "#f9786a"
  ink: "#ebe5f4"
  ink-strong: "#fbf9ff"
  muted: "#b8a9ce"
  delta-up: "#5ed8a9"
  void-base: "#130820"
  surface-one: "#1c102b"
  surface-two: "#271a37"
  surface-three: "#342646"
  hairline: "#3b2e4e"
  control-line: "#7d6a99"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1.6rem + 4vw, 4.25rem)"
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.2rem + 1.2vw, 1.875rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "normal"
  title:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "normal"
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  figure:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2rem, 1.4rem + 2.5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: "normal"
  label:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  chip: "4px"
  control: "6px"
  card: "10px"
  round: "50%"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
  "9": "96px"
components:
  button-primary:
    backgroundColor: "{colors.shelf-violet-solid}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.surface-two}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface-one}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.5}"
  card-hover:
    backgroundColor: "{colors.surface-two}"
    textColor: "{colors.ink}"
  tag:
    backgroundColor: "{colors.surface-two}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
---

# Design system: letsgaming.de

Values below are the dark theme unless a light value is given. The light theme and all computed contrast ratios are in the tables. This file is the source of truth for values; `docs/concepts/design-system.md` explains the rules behind them.

Status: this describes the target of the 2026-11-18 redesign. `docs/plans/` tracks which steps have shipped. Until a step ships, `styles/tokens.css` may still hold older values. Findings against the old design are in `DESIGN-AUDIT.md`. Evidence for the choices is in `docs/research/2026-11-18-redesign-research.md`.

## Overview

**Creative north star: "The Lit Room"**

The site is a dark room lit by a violet LED shelf. The room is purple: an aubergine ground, violet-tinted lines, lavender text, so nothing on the page is gray. The LED is the brightest violet on the page and it means one thing: something is happening right now. Imported color (language colors, game art, album art) is the only other hue, and it lands harder against a violet ground than against gray.

Purple is the owner's favorite color and an explicit call for this site: the scheme is built around it, not sprinkled on a neutral base. It is built deliberately so it does not read as a template. The rules that make it deliberate are under "Named rules" below.

The feel is warm, plain and personal, with precise numbers underneath. It is one person's homepage that updates itself. It is not a marketing surface.

Keywords: one violet world in three tiers; the brightest violet means now; flat tonal steps; imported color; freshness is a state; motion with a reason.

## Colors

One hue, OKLCH 303 (amethyst, a step toward magenta from the template-default indigo-violet at 293). Everything is tinted with it, in three tiers of intensity:

- **The room:** surfaces and lines, chroma about 0.05 (dark) or 0.02 to 0.03 (light). Flat steps, no gradient.
- **Data and structure:** the heat ramp and muted text, chroma 0.045 to 0.14. Mid violets.
- **The signal:** `--live*`, chroma 0.19 to 0.21. The LED. Means now.

Ratios use the WCAG 2.x formula and are checked by `pnpm --filter web audit:a11y` on the rendered site in both themes.

| Token | Dark | Light | Job and contrast |
|---|---|---|---|
| `--surf-0` | `#130820` | `#f5effe` | Page ground |
| `--surf-1` | `#1c102b` | `#fcfaff` | Raised: cards, panels |
| `--surf-2` | `#271a37` | `#fefdff` | Hover, selected, inputs |
| `--surf-3` | `#342646` | `#ede5fb` | The one anchor surface per page |
| `--ink` | `#ebe5f4` | `#2c1e3e` | Body text. At least 4.5:1 on every surface |
| `--ink-strong` | `#fbf9ff` | `#1b0f28` | Headings, wordmark |
| `--muted` | `#b8a9ce` | `#63507e` | Secondary text. 6.35:1 minimum (dark), 5.77:1 (light) |
| `--live` | `#c08eff` | `#7d33c2` | Signal for dots, bars and the today cell. Non-text |
| `--live-ink` | `#d2b3fe` | `#6b21aa` | Signal as text and the focus ring. 7.69:1 minimum (dark), 7.1:1 (light) |
| `--live-solid` | `#833ac9` | `#7d33c2` | Primary button fill. White text on it: 6.15:1 (dark), 6.72:1 (light) |
| `--danger` | `#f9786a` | `#af2b25` | Errors only |
| `--delta-up` | `#5ed8a9` | `#036f4f` | Positive change |
| `--line-1` | `#3b2e4e` | `#ded6ec` | Decorative divider. Not a control boundary |
| `--line-2` | `#514167` | `#c3b7d6` | Emphasized divider, card hover edge |
| `--line-control` | `#7d6a99` | `#8975a5` | Input and control borders, at least 3:1 |
| `--heat-0..4` | `#261c33 #402d58 #5b407c #7854a3 #946cc7` | `#e9e3f2 #d1c3e6 #b9a0dd #a27ed1 #8c62c0` | Violet data ramp. Adjacent steps at least 1.32:1; top step on a card 4.51:1 (dark), 4.38:1 (light) |
| `--heat-today` | `--live` | `--live` | The brightest cell: today, when it has activity (1.64:1 against the top step in dark, 1.48:1 in light, plus the hue and chroma jump) |

Theme-independent and imported (never retuned): Spotify, YouTube, Twitch and Discord brand colors; GitHub language colors; game and album art. CMS chart colors (`--stack-*`) stay inside the CMS.

There is no "faint" text token. Every candidate failed 4.5:1 on raised surfaces.

### Named rules

**The room is violet.** Surfaces, lines, ink and the data ramp all carry the hue. No gray ground, no gray text. A new neutral is a violet at low chroma, never a true gray.

**The signal means now.** The brightest violet (`--live`, `--live-ink`, `--live-solid`) has three jobs: live or just-happened data (including the today cell), the one primary action per view, and the focus ring. The room being purple does not weaken this: it is why the signal has to be the brightest, most saturated step, so "now" still stands out. `lint:design` holds the signal tokens to a per-file allowance.

**Deliberate, not default.** These are what keep a purple scheme from reading as a template:
- The hue is 303, not the 293 that Tailwind's violet and most generated pages sit on.
- Flat tonal steps only: no gradient, no glow except the live dot, no glass or blur.
- Chroma is spent by tier (room about 0.05, data 0.045 to 0.14, signal 0.19), not applied evenly to everything.
- Depth comes from surface steps and hard offsets (the keycap edge, a deeper violet), not from soft shadows or glows.
- Purple on every card edge, icon tile or heading is not a design; the room carries it, and the signal appears sparingly.

**Imported color.** Violet is the only color this palette invents. Everything else comes from data (language colors, game and album art). Invented per-topic tints (the old hobby tiles) are out.

**Control boundaries get 3:1.** A control whose border is its only edge uses `--line-control`, never `--line-1`.
## Typography

Three faces, self-hosted through `@fontsource`. Availability of the Atkinson packages is checked in plan Step 2 before any change; the plan stops there if a package or tabular figures are missing.

| Role | Face | Why |
|---|---|---|
| Display: wordmark, page H1, section H2, big figures | Archivo (variable, width and weight axes) | The width axis fits long German words and large stat numbers without shrinking the size. A heavy grotesque echoes scoreboard type, which suits a gaming handle without a costume font. |
| Body and UI | Atkinson Hyperlegible Next | Built for legibility (distinct I, l, 1, 0, O). The site is mostly scanned stats and lists. Covers German. |
| Synced numbers and timestamps | Atkinson Hyperlegible Mono | Same skeleton as the body. Mono marks a number as synced; it is not used for labels. |

### Scale (public density)

| Token | Value | Use |
|---|---|---|
| `--fs-meta` | 0.8125rem (13px) | Timestamps, captions |
| `--fs-small` | 0.9375rem (15px) | Secondary lines in lists |
| `--fs-body` | 1.0625rem (17px) | Body |
| `--fs-h3` | 1.25rem (20px) | Card and row titles |
| `--fs-h2` | clamp(1.5rem, 1.2rem + 1.2vw, 1.875rem) | Section headings |
| `--fs-h1` | clamp(2.25rem, 1.5rem + 3vw, 3.25rem) | Area page title |
| `--fs-display` | clamp(2.5rem, 1.6rem + 4vw, 4.25rem) | Home hero only; Archivo width 75, weight 700 |
| `--fs-figure` | clamp(2rem, 1.4rem + 2.5vw, 3rem) | Big stat numbers; Archivo, tabular figures |

Line height: display 1.0, headings 1.15, body 1.55. Measure: prose at most 66ch. Tracking: none on body; display -0.01em. The body size stays at or above 16px.

No uppercase, letter-spaced labels on the public site. The CMS keeps a smaller density remap (the `.cms` block in `tokens.css`).

## Spacing

A 4px-based scale with large steps between groups: 4, 8, 12, 16, 24, 32, 48, 64, 96 (`--space-1` to `--space-9`). Related items sit close; unrelated groups sit far. Two section gaps on purpose: 48px between related modules, 96px before an unrelated group.

Containers: `.wrap` is 1040px for data pages. Reading pages use a 66ch column.

During migration the old `--sp-*` tokens stay as aliases. Plan Step 10 removes them.

## Radii

| Token | Value | Use |
|---|---|---|
| `--r-1` | 4px | Chips, tags, heat cells, inputs |
| `--r-2` | 6px | Buttons, controls, images |
| `--r-3` | 10px | Cards, the presence widget, the modal |
| `--r-round` | 50% | Avatars and the live dot only |

No pills. The settings switch track and its knob are the only other fully round shapes, because a switch is read by its shape. A radius that is a large part of its object (the old 24px on a small avatar, 15px on buttons) is a drift, not a style.

## Breakpoints

Two for the public site: 560px (phone) and 720px (tablet). Container queries inside a module may use their own widths. The docs layout also breaks at 720px.

## Elevation and borders

Declare elevation once.

- Dark: surface step plus `--line-1`. No shadow.
- Light: resting cards use `--line-1` only. No shadow.
- Light, floating things only (modal, settings popover): `0 2px 6px rgb(18 16 26 / .08), 0 12px 32px rgb(18 16 26 / .10)`.
- Controls: `--line-control`.
- No colored `border-left` or `border-top` accents. State is shown with text or an icon.

**One anchor.** `--surf-3` appears at most once per page. Cards are never nested.

## Motion

Tokens: `--dur-fast` 120ms, `--dur-press` 100ms, `--dur-pulse` 2.4s, `--ease-out` cubic-bezier(.2, .8, .25, 1).

Two jobs only:

1. **The keycap press** on both button variants. The button moves down with `translateY` and its shadow compresses. It answers a touch.
2. **The live pulse** on the presence dot and the fresh-sync dot, only while the data is live.

The panel fade on tab switch stays, because it marks a state change. There is no scroll entrance animation and no hover lift. Reduced motion keeps color and opacity transitions and removes movement.

## Glow

The live dot is the only element that may glow. Depth is never faked with a colored bloom.

## States

Every synced module renders its real state: `fresh`, `stale`, `empty`, `failed`, `never`. Old data never pretends to be current. Details are in `docs/concepts/design-system.md`.

Every interactive element has hover, active, focus-visible, and disabled states. Only controls look clickable.

## Components

The site needs these and nothing more.

- **Shell:** `AreaPage` (header, footer), `SiteChrome` (tabs, settings), `SettingsModal`. The wordmark is the name set in Archivo. The tab strip marks the selected tab with an underline and ink-strong text, never the accent.
- **Text:** page title; section heading (`ModuleSection` with two variants, `plain` and `ruled`); global `.prose` for Bio, posts, legal, and docs.
- **Data:** figure (number plus label); ranked row; heat grid and strip; language bars; event row; table row (a CSS pattern, not a component library); segmented control; drill panel; freshness marker.
- **Media:** project screenshot; gallery tile; cover art.
- **Forms:** `BaseForm` inputs, primary and secondary buttons, contact form, guestbook form. Labels sit above inputs.
- **Containers:** `ModuleCard`, used by at most two modules per page; the presence widget.

Removed: hobby gradient tile, teaser box, round arrow badge, pill-shaped "Pinned" badge.

### Buttons

- Radius `--r-2`. Padding 12px 20px.
- Primary: `--live-solid` fill, white text. One per view.
- Secondary: `--surf-2` fill, ink text.
- Both: keycap press.

### Cards

- Radius `--r-3`. `--surf-1` at rest, `--surf-2` on hover (dark and light).
- Border `--line-1`. No shadow at rest.
- Padding 24px.

### Chips and tags

`--surf-2` fill, ink text, `--r-1`, mono label size, 2px 8px padding. Language chips show the language color as a dot.

## Layout

Layout differs between pages on purpose, so no single arrangement becomes the identity.

- **Home:** text block, ruled index list, one large figure, one asymmetric feature, a running quote column.
- **Code:** dense data in a wide container: figure row, full-width heatmap, dated list, table rows, one card.
- **Life:** imported color leads; one anchor widget; a poster-style Wrapped; a varied gallery.
- **About and posts:** one reading column, no containers.

A layout family appears at most once per page. At most two `ModuleCard` per page.

## Copy

- Plain functional labels. One label per intent ("Contact", not three phrasings).
- No em or en dashes. Sentence case. No stock adverbs ("quietly", "genuinely"), no buzzwords (leverage, foster, seamless, elevate, unlock).
- Every fact in the copy is a true fact about the owner. Nothing is invented.
- German and English are written separately, not translated word for word.

## Do's and don'ts

### Do

- Use the signal violet (`--live*`) for live data, the one primary action per view, and the focus ring. Build everything else from the room and data violets.
- Express elevation as a surface step on dark, and keep shadows for floating things on light.
- Render a synced module's real freshness state.
- Source color from real data wherever the page has real data.
- Use tokens for every size, radius, and color.

### Don't

- Don't use the signal violet for a selected tab, an active toggle, or a data series. The heat ramp is the data violet; the signal is only for now.
- Don't fake depth with a glow or a gradient wash.
- Don't add uppercase tracked labels, middle-dot meta strings, or `→` on link text.
- Don't give two sections on one page the same layout family.
- Don't animate on scroll.
- Don't invent a palette color. If a need cannot be met from data or the existing scale, it needs a reason first.

## Enforcement

`pnpm lint:design` (part of `pnpm build`, so CI runs it) checks what a grep can decide: no middle-dot separators, no arrow glyphs on link text, no uppercase or letter-spaced labels, mono (`--f-m`) and accent (`--live`, `--live-ink`, `--live-solid`) uses held to a per-file allowance in `apps/web/scripts/lint-design.ts`, and no new em or en dashes in comments (`dash-baseline.json` allows the existing ones and shrinks as files are touched). Raising an allowance is a reviewable edit to that file. Rules a grep cannot decide (layout variety, "does this read as generated") stay in the critique.