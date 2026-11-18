---
name: letsgaming.de
description: A self-updating personal homepage where one violet accent means "happening right now."
colors:
  shelf-violet: "#a487fa"
  shelf-violet-solid: "#7a4fd9"
  live-ink: "#baa9fd"
  alarm-coral: "#f9786a"
  ink: "#e8e7ee"
  ink-strong: "#fafafd"
  muted: "#a8a5b6"
  delta-up: "#5ed8a9"
  void-base: "#0e0e12"
  surface-one: "#17161c"
  surface-two: "#211f27"
  surface-three: "#2a2931"
  hairline: "#26252c"
  control-line: "#75727f"
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

**Creative north star: "The Live Signal"**

Violet means one thing on this site: something is happening right now. Everything else is neutral, or it is color that real data brings (language colors, game art, album art). The page gets more colorful in proportion to how much real data it holds.

The feel is quiet, plain, and personal, with precise numbers underneath. It is one person's homepage that updates itself. It is not a marketing surface.

Keywords: one accent with three jobs; neutral surfaces; imported color; freshness is a state; motion with a reason.

## Colors

The accent hue is fixed at OKLCH hue 293. Surfaces and text use the same hue at chroma 0.004 to 0.025, so they read as gray with a faint cast, not as purple. All ratios use the WCAG 2.x formula.

| Token | Dark | Light | Job and contrast |
|---|---|---|---|
| `--surf-0` | `#0e0e12` | `#f7f6f9` | Page ground |
| `--surf-1` | `#17161c` | `#fdfdff` | Raised: cards, panels |
| `--surf-2` | `#211f27` | `#ffffff` | Hover, selected, inputs |
| `--surf-3` | `#2a2931` | `#f0eff4` | The one anchor surface per page |
| `--ink` | `#e8e7ee` | `#24222d` | Body text. 11.7:1 minimum (dark), 13.7:1 (light) |
| `--ink-strong` | `#fafafd` | `#12101a` | Headings, wordmark |
| `--muted` | `#a8a5b6` | `#5e5b6d` | Secondary text. 5.97:1 on dark surf-3; 5.75:1 on light surf-3 |
| `--live` | `#a487fa` | `#6738c1` | Accent for dots, bars, and heat cells. Non-text. 5.09:1 minimum on dark |
| `--live-ink` | `#baa9fd` | `#5f2db7` | Accent as text and focus ring. 6.97:1 minimum (dark), 7.21:1 (light) |
| `--live-solid` | `#7a4fd9` | `#6738c1` | Primary button fill. White text on it: 5.32:1 (dark), 7.21:1 (light) |
| `--danger` | `#f9786a` | `#af2b25` | Errors only. 5.43:1 minimum (dark), 5.75:1 (light) |
| `--delta-up` | `#5ed8a9` | `#036f4f` | Positive change. 8.13:1 (dark), 5.41:1 (light) |
| `--line-1` | `#26252c` | `#e1e0e6` | Decorative divider. Not a control boundary |
| `--line-control` | `#75727f` | `#868491` | Input and control borders. 3.06:1 minimum (dark), 3.41:1 (light) |
| `--heat-0..4` | `#211f27 #3f355e #5e4d92 #7f67c5 #a487fa` | `#e8e7ee #c5bde8 #a191dd #8063cf #6231ba` | Heat scale. Top step vs card: 6.36:1 (dark), 7.75:1 (light) |

Theme-independent and imported (never retuned): Spotify, YouTube, Twitch and Discord brand colors; GitHub language colors; game and album art. CMS chart colors (`--stack-*`) stay inside the CMS.

There is no "faint" text token. Every candidate failed 4.5:1 on raised surfaces.

### Named rules

**Purple means now.** The accent has three jobs: live or just-happened data, the one primary action per view, and the focus ring. It is not for the active tab, a selected setting, a hover, or a chart series. Selected states use ink against muted.

**Imported color.** Violet is the only color this palette invents. Everything else comes from data. Invented per-topic tints (the old hobby tiles) are out.

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

No pills. A radius that is a large part of its object (the old 24px on a small avatar, 15px on buttons) is a drift, not a style.

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

- Use the accent for live data, the one primary action per view, and the focus ring.
- Express elevation as a surface step on dark, and keep shadows for floating things on light.
- Render a synced module's real freshness state.
- Source color from real data wherever the page has real data.
- Use tokens for every size, radius, and color.

### Don't

- Don't use the accent for a selected tab, an active toggle, or a chart series.
- Don't fake depth with a glow or a gradient wash.
- Don't add uppercase tracked labels, middle-dot meta strings, or `→` on link text.
- Don't give two sections on one page the same layout family.
- Don't animate on scroll.
- Don't invent a palette color. If a need cannot be met from data or the existing scale, it needs a reason first.
