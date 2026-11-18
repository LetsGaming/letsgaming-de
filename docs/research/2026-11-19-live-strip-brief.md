> Status: dropped after owner review (2026-11-19). The owner liked the idea but found it out of place in the header, with no clear reason to be there and a meaning nobody would read without hovering. The component and data layer were removed. Kept as a record of the idea and the guardrails.

# Live strip: design brief

Status: built in the hardening workplan, phase 4. This is the identity device chosen by the owner (concept A of three).

## Why

The 2026-11-18 critique found the redesign removed the loud tells but left no recognisable identity: cover the name and the page could belong to any developer. The site's real claim (PRODUCT.md) is "it's alive": its data updates itself. The strip puts that claim on every page as evidence, not as a sentence.

## What

A strip of 28 cells, one per day, oldest left and today right, under the header on every page, with a caption: "Last 28 days" on the left and the sync age on the right.

- A day's weight merges three observed sources: commits, game minutes, listening minutes. Each is scaled to its own busiest day and the three are added, so a 40 commit day and a 6 hour gaming day both read as busy and neither hides the other.
- The ramp is the violet data scale (`--heat-0..4`). Today's cell is the brightest violet (`--heat-today`, the signal), and only when today has activity. So the one brightest cell on the page means "now", in the same colour language as the live presence dot.
- The weight is relative (it shows shape, not volume), the same convention as the contribution heatmap.

## Guardrails

- Every cell is a real day with real data. When nothing has ever been observed the strip does not render, because empty cells would claim a quiet month the site cannot know about.
- One strip per page, never a section marker or a repeated ornament.
- No glow, no animation, no gradient. The only motion on the page for "now" remains the live presence dot.
- The strip is not interactive. Cells have a native tooltip for a pointer ("Wed 18 Nov: 1h 27min played, 10min listened"). The whole strip has one accessible summary, so a screen reader hears one sentence, not 28 stops.
- It carries the page-level "synced X ago" line, so the footer shows that line only when there is no strip.

## Measurements

- 1280px: cells 31 by 14px. 390px: cells 9 by 14px, 28 of them in 336px, no horizontal scroll.
- Data: `SiteView.pulse` (`PulseView` in `packages/core/src/view.ts`), built by the pure `buildPulse` in `packages/core/src/resolve.ts`. The music ledger for the full span comes from `packages/db/src/site-view.ts`, because the music module's own window can be shorter.
- Days are computed in the display time zone with plain UTC date arithmetic, so a DST day cannot skip or repeat a cell (tested).

## Risk

A strip of cells reads as a progress bar or a GitHub-style graph if it is only decoration. It earns its place only while it stays true and quiet. If the owner finds it decorative, remove `LiveStrip` from `AreaPage.vue`; nothing else depends on it.
