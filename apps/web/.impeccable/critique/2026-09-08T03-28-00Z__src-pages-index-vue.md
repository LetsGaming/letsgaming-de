---
target: Home area (src/pages/index.vue)
total_score: 22
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
timestamp: 2026-09-08T03-28-00Z
slug: src-pages-index-vue
---
Method: dual-agent (A: general-purpose design-review agent · B: general-purpose detector/browser-evidence agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Hero now shows a "synced Xm ago" caption when data exists (real fix since last run); none of these state changes reach assistive tech — no `aria-live` anywhere |
| 2 | Match System / Real World | 3 | Personal, casual voice throughout; GuestbookForm.vue renders hardcoded English labels/button even on the German render — verified live at `?lang=de` |
| 3 | User Control and Freedom | 2 | No in-page section jump; guestbook form has no explicit cancel/clear beyond browser defaults (unchanged) |
| 4 | Consistency and Standards | 3 | ModuleSection.vue's shared heading/note shell holds up across all four Home modules; the GuestbookForm i18n gap is a genuine, undocumented break in that consistency |
| 5 | Error Prevention | 3 | Honeypot + FIELD_LIMITS maxlength + tailored 429 copy (unchanged) |
| 6 | Recognition Rather Than Recall | 3 | `aria-current` on nav, visible field labels, self-explanatory headings |
| 7 | Flexibility and Efficiency | n/a | Read/Experience-mode homepage — no power-user acceleration path applies |
| 8 | Aesthetic and Minimalist Design | 3 | Restraint holds up visually at both desktop and mobile breakpoints tested live |
| 9 | Error Recovery | 2 | Confirmed (not just suspected, as last run): `BaseForm.vue`'s `.err` span has no `role="alert"`/`aria-live` — a rate-limited or failed submit is silent to screen readers |
| 10 | Help and Documentation | n/a | Correctly absent on a personal homepage; the `/docs` footer link remains a reasonable substitute |
| **Total** | | **22/32** | **Acceptable-to-Good (69%)** |

(Heuristics 7 and 10 marked n/a per the mode-applicability rule — this is a Read/Experience surface, not a tool. Same numeric total as the 2026-08-27 run, but the composition shifted: two prior P1s are now genuinely fixed, offset by one newly-verified i18n bug and one newly-confirmed accessibility gap.)

## Design Specificity Verdict

**LLM assessment**: Partially grounded, and measurably improved since the last critique. The copy and state layer is now genuinely product-specific: Freshness.vue's typed five-state map, FeaturedSection's "picked" pinned/latest disclosure, the hero's new "synced Xm ago" caption (reusing the exact mono/micro/muted convention every other synced value uses), and honest empty-state copy ("not synced yet," "Nothing pinned right now," "No notes yet — be the first to sign") are doing real product-specific work, not generic filler. But the *composition* — avatar/headline/lede hero → 2-column stat grid → single project card → comment wall — is still a shape any personal developer site could wear unchanged. Specificity has deepened in the plumbing and the copy; it hasn't yet reached the layout/interaction level.

**Deterministic scan**: `detect.mjs` run against `src/pages/index.vue`, `AreaPage.vue`, and the sections/shell/ui component trees returned **1 finding** (down from 9 on 2026-08-27): `design-system-font-size` at `PlaytimeSection.vue:384` — `font-size: 9px` on `.pt-heat-days`, a 7-row day-axis label column beside a small heatmap (`grid-template-rows: repeat(7, 13px)`). This is a genuine drop, not detector noise: `.impeccable/config.json`'s `ignoreValues` allowlist shows all 9 prior findings were individually triaged between 2026-08-27 and 2026-08-29 with documented reasons (proportional-to-object sizing on small heatmap cells, deliberate lead-stat emphasis, icon-glyph sizing, etc.) — the raw values are unchanged in source but adjudicated as intentional, not silently fixed. The new PlaytimeSection.vue finding is the same "small axis label next to a small heatmap" pattern the allowlist already accepted once for `HeatGrid.vue`'s 10px legend caption paired with 9px swatches — very likely a legitimate micro-label rather than drift, but it postdates the last triage pass and hasn't been through it. **Flag for a human decision**: allowlist with a documented reason (matching the HeatGrid precedent) or bump to a real documented step (`--fs-micro` or similar).

**Visual overlays**: Partial. Assessment A successfully loaded the live dev server (actually on port 4321, not 3000 as briefed — `nuxt.config.ts` sets `devServer.port` explicitly) and captured real desktop (1440px) and mobile (390px) screenshots plus an accessibility-tree/keyboard-nav pass, all summarized below. Assessment B, run afterward against the same server, hit a reproducible client-side 500 (`Failed to fetch dynamically imported module: .../pages/index.vue`, `Hydration completed but contains mismatches`) across three separate retries in two fresh tabs — a Vite dev-server dynamic-import/optimize-deps glitch, not an application bug (server-side `curl` to the identical URL returned clean 200 SSR markup throughout). As a result, the mechanical detector-overlay injection (`live-server.mjs` + `detect.js` console highlighting) was not obtained this run — only Assessment A's direct screenshots stand in for visual evidence. No user-visible overlay tab is open; treat the screenshot-based observations below as the visual evidence for this run, and re-run the injection step after a clean dev-server restart if overlay-level highlighting is wanted later.

## Overall Impression

Real, deliberate progress on both P1s flagged 12 days ago — the hero's synced-caption and the guestbook's bounded list are not cosmetic patches, they reuse existing typographic and list-pattern conventions correctly. But two things slipped through in the same window: a public-facing form that's still hardcoded English mid-German-page, and a confirmed (not just suspected) silent error state for screen-reader users on that same form. The biggest opportunity is still the same shape as last time: the "it's alive" positioning is carried by increasingly well-crafted micro-signals (a caption, a badge, a dot) rather than by the page's actual structure — and the literal worst-case state that positioning has to survive (fresh deploy, backend outage, or just a new visitor before first sync) currently reads as an abandoned site, the opposite of the pitch.

## What's Working

1. **Hero's "synced Xm ago" caption** (`HeroSection.vue:64`) is a well-executed fix for the prior critique's core P1 — delivered via injection rather than threaded through every module, and typeset identically to every other synced value on the page, so it reads as fact rather than decoration.
2. **GuestbookSection's `useLimitedList` + `ListFooter` reuse** directly closes the prior guestbook-growth P1 by reusing a pattern already proven on Activity/Playtime, rather than inventing a new one.
3. **FeaturedSection's "picked" label** closes the "why this one project" ambiguity with one honest, on-convention line.

## Priority Issues

**[P1] GuestbookForm.vue ships hardcoded English strings on the German render.**
Why it matters: verified live at `?lang=de` — "Name," "Message," and "Sign the guestbook" render in English mid-German page (`GuestbookForm.vue:30-38`, none routed through `useT()`). This directly contradicts the bilingual product requirement and undercuts the stated brand voice ("should feel like a person, not a company") at the exact moment a visitor is trusting the site with their own words.
Fix: add message keys (`guestbookNameLabel`, `guestbookMessageLabel`, `guestbookSubmit`, `guestbookSending`, `guestbookSuccess`) and route every string through `t()`, matching the localization pattern already used elsewhere.
Suggested command: /impeccable clarify

**[P1] The one public form's error state has no `role="alert"`/`aria-live`.**
Why it matters: confirmed by direct source read (`BaseForm.vue:21`, `<span v-if="state === 'error'" class="err">`) — a WCAG 4.1.3 status-messages gap at the site's single error-prone interaction. A screen-reader user who gets rate-limited or fails validation on the guestbook gets total silence.
Fix: add `role="alert"` to `.err` (and consider announcing the `.ok` success swap too, since focus never moves there either).
Suggested command: /impeccable harden

**[P2] Hero CTA links have no enforced cap.**
Why it matters: `HeroSection.vue:66-78`'s `v-for="l in module.data.links"` is unbounded, unlike the nav tree's enforced `MAX_CHILDREN`. Currently safe with 2 links, but nothing structurally guarantees the design system's own ≤4-visible-options rule as CMS content grows.
Fix: mirror the nav's enforcement pattern.
Suggested command: /impeccable harden

**[P2] The literal "never synced" state is under-designed for a site whose entire pitch is "it's alive."**
Why it matters: verified live — with no synced data, Glance drops its stat grid entirely (not even zeroes), Featured and Guestbook each fall to one plain sentence, and the hero's new synced caption simply disappears rather than degrading gracefully. Three stacked "nothing here yet" modules is the literal first impression a fresh deploy, a backend outage, or a same-day new visitor could see — the opposite of the positioning claim.
Fix: decide deliberately whether this state can occur in production and, if so, give it one considered, warmer treatment instead of three independent empty-string fallbacks.
Suggested command: /impeccable harden or /impeccable clarify

**[P3] `AreaPage.vue`'s new invisible `<h1 class="visually-hidden">` (line ~77) fixes the document-structure gap but not the visual one.**
Why it matters: a sighted visitor on `/code` or `/life` still sees a `ModuleSection` `<h2>` as the top of the visible hierarchy — there's no visible page title on non-home areas. The screen-reader-only heading is the right minimal fix for SEO/structure, but it's worth a deliberate call on whether non-home areas should ever get a visible title, rather than leaving it implicit.
Suggested command: /impeccable layout

## Persona Red Flags

**Jordan (first-timer)**: in the never-synced state captured live, Jordan's first impression is the opposite of "it's alive" — no stats, "Nothing pinned," "No notes yet." When data *is* synced, the new hero caption is a real improvement over the prior single-dot problem.

**Sam (accessibility-dependent, screen reader + keyboard)**: submitting the guestbook and hitting an error produces no announcement at all. A German-locale screen-reader session also hits "Message" mid-sentence in English, breaking both meaning and pronunciation flow at the one interactive moment on the page.

**Casey (mobile, 390px)**: the header stacks cleanly (brand row, then nav+settings row) with no overlap or truncation, and the Featured/Guestbook modules held up structurally at this width — density under real (non-empty) project data wasn't stress-tested this run since Featured was in its empty state, and is worth a follow-up pass.

## Minor Observations

- Computed contrast of `--muted` (#948cb6) on `--void-base` (#0e0c18) is ~6.1:1 — comfortably passes AA.
- Keyboard focus ring on the brand link is a clean, correctly-scoped Shelf-Violet outline, matching DESIGN.md's rule that the focus ring is one of the accent's only three jobs.
- Locale defaulted to German on first unparameterized load in this session (likely Accept-Language-driven) — worth confirming this matches the intended default.
- The one fresh detector finding (`PlaytimeSection.vue:384`, 9px axis label) is very likely a legitimate one-off matching an already-accepted pattern elsewhere, but needs the same explicit triage the other 9 got rather than sitting untriaged.

## Questions to Consider

1. Now that the hero's synced caption is honest and well-typeset, has anyone actually looked at what the page reads like in the literal empty/never-synced state — is three stacked "nothing here yet" modules an acceptable first impression, or does the state model need its own warmer copy pass?
2. Should there be a lint/test gate that scans components for hardcoded, untranslated user-facing strings, so a hand-authored form can't silently skip the localization discipline the rest of the page enforces?
3. Is the invisible `<h1>` on non-home areas the final answer, or a placeholder until Code/Life/About get their own visible heading treatment?
