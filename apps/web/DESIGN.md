---
name: letsgaming.de
description: A self-updating personal homepage where one violet accent means "happening right now."
colors:
  shelf-violet: "#8b5cf6"
  shelf-violet-solid: "#8351f5"
  live-ink: "#a78bfa"
  alarm-coral: "#ff6b5e"
  alarm-coral-ink: "#ff8f85"
  ink: "#ece9f7"
  ink-strong: "#ffffff"
  muted: "#948cb6"
  void-base: "#0e0c18"
  surface-one: "#1a1730"
  surface-two: "#231e3e"
  surface-three: "#2d2650"
  hairline: "rgba(255, 255, 255, 0.07)"
  hairline-violet: "rgba(167, 139, 250, 0.22)"
typography:
  display:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontSize: "clamp(38px, 7.5vw, 66px)"
    fontWeight: 700
    lineHeight: 1.03
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontSize: "clamp(22px, 4vw, 30px)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontSize: "clamp(19px, 3.2vw, 25px)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Space Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  chip: "8px"
  control: "10px"
  card: "14px"
  anchor: "18px"
  pill: "999px"
spacing:
  "2": "2px"
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "14": "14px"
  "16": "16px"
  "18": "18px"
  "20": "20px"
  "22": "22px"
  "24": "24px"
  section: "52px"
components:
  button-primary:
    backgroundColor: "{colors.shelf-violet-solid}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "15px"
    padding: "12px 20px"
  button-primary-active:
    backgroundColor: "{colors.shelf-violet-solid}"
    textColor: "#ffffff"
  button-ghost:
    backgroundColor: "{colors.surface-two}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "15px"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface-one}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.24}"
  card-hover:
    backgroundColor: "{colors.surface-two}"
    textColor: "{colors.ink}"
  tag:
    backgroundColor: "{colors.surface-two}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

# Design System: letsgaming.de

## Overview

**Creative North Star: "The Live Signal"**

Purple means one thing on this site: something is happening right now. That's the whole job description for Shelf Violet — sampled off a real LED strip on a shelf, photographed on `/life`, not chosen from a swatch — and the system is built to keep it that job alone. A page whose colours mostly come from real, external data (linguist language colours, a game's RAWG cover art, a plant being green because it is) has one invented colour left to protect, and every rule here exists to protect it.

The feel is quiet, warm, and personal, with a note of precise stats running underneath. This isn't a marketing surface performing confidence — it's one person's homepage that happens to update itself. Warmth comes from restraint (no aurora glow, no stacked gradients, no entrance choreography) rather than decoration; precision shows up as Space Mono numbers that read as "synced" the instant you see them, and as a strict, documented state model (`fresh` / `stale` / `empty` / `failed` / `never`) that refuses to let old data pretend to be current.

Controls are tactile and honest: buttons press with `translateY`, a ghost button's shadow visibly compresses on `:active` like a real key, and elevation on dark is surface lightness stepping upward — never a shadow pretending to fall on a background too dark to catch one. Nothing performs without a reason; the one thing allowed to glow is the live dot, because it's the one thing that's actually live.

**Key Characteristics:**
- One accent, three named jobs (live data, the one primary action, the focus ring) — never a fourth.
- Colour is imported, not invented — the palette gets richer only because real data does.
- Elevation is surface lightness on dark, shadow on light — never a purple glow standing in for either.
- Freshness is a rendered state, not an assumption — a synced module says its own age.
- Motion has a reason (state change, live-ness, a touch) or it doesn't ship.

## Colors

The palette is almost entirely functional: one accent (Shelf Violet) for now-ness, one alarm colour for error states, and a stepped neutral scale that carries everything else. It gets more colourful only when real data (language colours, game art, presence status) is on the page — never from the system itself.

### Primary
- **Shelf Violet** (#8b5cf6): The one accent. Live/just-happened data, the single primary action per view, and the focus ring — nothing else. Named for its source: sampled off the LED strip on the shelf, photographed on `/life`.
- **Shelf Violet, Solid** (#8351f5): Same hue, two lightness steps down, for the one surface that has to carry white text at body size (the primary button fill) — Shelf Violet itself falls just short of AA there.
- **Live Ink** (#a78bfa): The accent as text or a stroke — the focus-visible outline and the freshness dot's "fresh" colour.

### Secondary
- **Alarm Coral** (#ff6b5e) / **Alarm Coral Ink** (#ff8f85): The only non-purple hue the palette owns, and it earns the exception by being a state, not a style — form and validation errors only.

### Neutral
- **Ink** (#ece9f7): Primary body text on dark.
- **Ink Strong** (#ffffff): Headings, emphasis, the wordmark.
- **Muted** (#948cb6): Secondary text, metadata, inactive states.
- **Void Base** (#0e0c18) → **Surface One** (#1a1730) → **Surface Two** (#231e3e) → **Surface Three** (#2d2650): The four-step elevation ladder (see Elevation & Depth).
- **Hairline** (rgba(255,255,255,.07)) / **Hairline Violet** (rgba(167,139,250,.22)): Default and emphasized borders.

### Named Rules
**The Purple Means Now Rule.** The accent has exactly three jobs — live/just-happened data, the one primary action per view, the focus ring — and no others. Not the active nav tab, not a selected setting, not a hover, not a chart series. Selected states use ink-vs-muted contrast, never hue.

**The Imported Colour Rule.** Purple is the only colour this palette invents. Everything else — language colours, game art, presence status — comes from real data. The page gets more colourful in proportion to how much real data it holds, which no house palette can fake.

## Typography

**Display Font:** Fredoka (with system-ui, sans-serif)
**Body Font:** Inter (with system-ui, sans-serif)
**Label/Mono Font:** Space Mono (with ui-monospace, monospace)

**Character:** Fredoka carries warmth and a slightly rounded, friendly geometry, but is used sparingly — display and section-scale only. Inter disappears at body size, which is its job. Space Mono marks a value as machine-sourced/synced, so a number in mono reads as "live" before you even parse it.

### Hierarchy
- **Display** (700, clamp(38px, 7.5vw, 66px), 1.03 line-height, -0.01em): The hero H1 only.
- **Headline** (600, clamp(22px, 4vw, 30px)): Module section headings ("Recent", "Listening", "Coding").
- **Title** (600, clamp(19px, 3.2vw, 25px)): Card titles, one step below Headline.
- **Body** (400, 15px, 1.6 line-height): Prose, general UI text.
- **Label** (400, 12px, mono): Metadata, timestamps, and any value that came from a sync rather than the CMS.

### Named Rules
**The Four Roles Rule.** Fredoka reaches exactly four places — the wordmark, the H1, section headings, and card titles — and stops. It has no body-text design in it; the counters close up past ~16px, so it was never meant to carry prose.

## Layout

Mobile-first, single-column, comfortable density on the public site (a `.wrap` container capped at 940px, generous clamp-based padding). The CMS shares every token but runs a compact density variant (`.cms` scope) that tightens radius and type scale for a dense, desktop-first surface — one vocabulary, two ranges, never two systems.

Vertical rhythm between modules is a dedicated `--sp-section` (52px) gap, distinct from the 2px content spacing scale — a layout-level rhythm, not a content one.

## Elevation & Depth

Dark mode: elevation is surface lightness, not shadow. A drop shadow on a near-black background has nothing darker to fall onto, so lift is expressed as a step up the surface ladder (Void Base → Surface One → Surface Two → Surface Three) instead. Light mode inverts this: a light page has room to cast a shadow, so lift becomes an actual `box-shadow` again and surfaces stay close together.

### Shadow Vocabulary (light mode only)
- **Card** (`0 1px 2px rgba(30,20,60,.06), 0 6px 16px rgba(30,20,60,.07)`): Resting card elevation.
- **Anchor** (`0 2px 6px rgba(30,20,60,.08), 0 16px 40px rgba(30,20,60,.1)`): The one anchor surface per page, and a card's hover state.

### Named Rules
**The One-Anchor Rule.** Surface Three (the highest elevation step) appears at most once per page — the anchor. Never nest a level inside itself; going card → card → card is what it looks like when every level is treated as the same level.

**The No-Glow-As-Shadow Rule.** Depth is never faked with a colored bloom. The predecessor system used a purple glow to fake lift on dark backgrounds that couldn't cast a real shadow; this system steps surface lightness instead, honestly.

## Shapes

A five-step radius scale, all steps scaling with the size of the object they belong to (a 26px radius on a 90px box was most of the box, which is the failure mode this scale avoids): Chip (8px, pills/tags) → Control (10px, toggles/inputs) → Card (14px, cards/containers) → Anchor (18px, the largest single surfaces) → Pill (999px, fully rounded chips/badges). The CMS's compact density remaps these one step down without breaking the scale's relationships.

## Components

### Buttons
- **Shape:** 15px radius, regardless of variant.
- **Primary:** Shelf Violet, Solid fill, white text, 12px/20px padding.
- **Ghost:** Surface Two fill, Ink text, with an offset "pressed key" shadow (`0 5px 0` in a dark solid, plus an ambient shadow) that visibly compresses to `0 1px 0` on `:active` alongside a 4px `translateY` — the tactile-and-honest press made literal.
- **Active/Press (both variants):** `translateY(2px)` (ghost moves 4px, matching its taller resting shadow), on a fast press-duration ease.

### Cards
- **Corner Style:** 14px radius.
- **Background:** Surface One at rest, Surface Two on hover (a one-step lift, matching the elevation model).
- **Shadow Strategy:** Card shadow at rest, Anchor shadow on hover (light mode); dark mode expresses the same hover as a surface-lightness step, no shadow change.
- **Border:** Hairline at rest, Hairline Violet on hover.
- **Internal Padding:** 24px.

### Chips / Tags
- **Style:** Surface Two background, Ink text, fully rounded (pill), Space Mono at label size, 4px/10px padding.

### Navigation
- **Style:** A pill-shaped tab strip (Surface One background, Hairline border) with individual tabs at 11px radius; the active tab gets a Surface Two background and Ink Strong text — selection is contrast, never the accent hue, consistent with the Purple Means Now rule.

## Do's and Don'ts

### Do:
- **Do** use Shelf Violet for exactly three things: live/just-happened data, the one primary action per view, and the focus ring.
- **Do** express elevation as a surface-lightness step on dark backgrounds; reserve real shadows for light mode.
- **Do** render a synced module's actual freshness state (`fresh`/`stale`/`empty`/`failed`/`never`) — never show old data with no indication of its age.
- **Do** give every interactive control a real `:hover`/`:active`/`:focus-visible` state; a `.card` is an `<a>` and should feel like one.
- **Do** source colour from real data (language colours, game art) wherever the page has real data to source it from.

### Don't:
- **Don't** use the accent for a selected tab, an active toggle, a chart series, or anything else that isn't live data, the primary action, or the focus ring.
- **Don't** fake depth with a colored glow or bloom — that's the exact failure mode this system replaced.
- **Don't** apply hover/tilt affordances to an element that isn't actually interactive (a plain `<div>` shouldn't look clickable).
- **Don't** invent a palette colour. If a new visual need can't be sourced from real data or the existing neutral/accent scale, it doesn't belong here without a real reason.
- **Don't** let motion run without a job (state change, live-ness, or a touch) — an entrance animation that fires on every element individually is decoration, not communication.
