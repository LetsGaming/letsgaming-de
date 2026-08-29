---
target: Home area (src/pages/index.vue)
total_score: 22
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
timestamp: 2026-08-27T09-16-14Z
slug: src-pages-index-vue
---
Method: dual-agent (A: general-purpose design-review agent · B: general-purpose detector/browser-evidence agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Freshness only surfaces on Glance/Featured; Hero and Guestbook show no live/sync signal |
| 2 | Match System / Real World | 3 | Plain, personal language throughout ("right now", "At a glance") |
| 3 | User Control and Freedom | 2 | No in-page section jump; guestbook form has no cancel/clear beyond browser defaults |
| 4 | Consistency and Standards | 3 | ModuleSection.vue enforces one shared heading/note pattern; Hero's documented opt-out is the one exception |
| 5 | Error Prevention | 3 | Honeypot + FIELD_LIMITS + specific rate-limit copy; no proactive inline validation |
| 6 | Recognition Rather Than Recall | 3 | Nav always visible with aria-current; self-explanatory module headings |
| 7 | Flexibility and Efficiency | n/a | Read/Experience-mode homepage — no power-user path to accelerate |
| 8 | Aesthetic and Minimalist Design | 3 | Restraint is a stated (and followed) principle; stat-grid/featured-card density on mobile docks a point |
| 9 | Error Recovery | 3 | Tailored 429 copy is a real touch; inline error's aria-live/role="alert" unconfirmed |
| 10 | Help and Documentation | n/a | Correctly absent on a personal homepage; /docs link is a reasonable substitute |
| **Total** | | **22/32** | **Acceptable-to-Good (69%)** |

(Heuristics 7 and 10 marked n/a per the mode-applicability rule — Read/Experience surface, not a tool.)

## Design Specificity Verdict

Partially grounded. The token/state vocabulary (five-state freshness model, "Purple Means Now," ModuleSection's shared rhythm) is genuinely product-specific. The actual Home layout — avatar-hero → stat-strip → single-card showcase → comment wall — is a stock composition any personal site could wear unchanged. Specificity lives in the plumbing, not yet in the composition.

Deterministic scan: 9 findings, all advisory, none warning/error. 4 design-system-font-size (SettingsModal.vue:173, HeatGrid.vue:190, StatTile.vue:99, HeroSection.vue:95) and 5 design-system-radius (HeatGrid.vue:124,196, LanguageBars.vue:47,54, HeroSection.vue:132). Likely one-offs, not yet individually verified. Tool anomaly: exit code 2 despite zero non-advisory findings.

Visual overlays: not available. No Chrome/Chromium binary installed on this machine; both chrome-devtools MCP and Playwright failed to launch, and the detector's own URL-scan needs Puppeteer (also absent). Dev server itself came up and responded 200 (verified via curl), so the app runs — no screenshot/overlay evidence could be captured this run.

## Overall Impression

Engineering discipline is real (typed freshness state machine, one shared module shell, honeypot + tailored error copy) but not yet spent where it matters most: the "it's alive" positioning rides on a 9px pulsing dot, and nothing about the composition makes that the moment the page is built around.

## What's Working

1. Freshness.vue's typed state map — five states enforced as a Record<FreshnessState, MessageKey>, adding a state is a compile error not a blank span.
2. ModuleSection.vue as the one shared shell — closes the drift the project's own docs describe having had before.
3. GuestbookForm.vue's honeypot + tailored 429 copy — specific, considered craft on the one public form.

## Priority Issues

**[P1] Freshness — the core positioning signal — is nearly invisible on the page built to prove it**
Why it matters: PRODUCT.md's entire positioning claim is "it's alive." On Home that's carried by one small hero status dot and Glance's compact Freshness badge. A first-time skim can easily read this as a static portfolio.
Fix: give the hero's live signal weight proportionate to being the core differentiator (e.g. a short "synced Xm ago" caption), without violating the no-atmosphere rule.
Suggested command: /impeccable delight or /impeccable typeset

**[P1] Guestbook has no visible growth or pagination plan**
Why it matters: unbounded auto-fill grid works against the site's own longevity promise ("never look abandoned") over a multi-year timescale.
Fix: cap visible entries (latest N) with a "see all" link, mirroring the moreHref pattern Featured/Glance already use.
Suggested command: /impeccable harden or /impeccable layout

**[P2] Hero CTA/link count has no enforced cap**
Why it matters: unbounded v-for on module.data.links; the design system's own ≤4-options principle isn't structurally enforced here unlike the nav tree's MAX_CHILDREN cap.
Fix: mirror the nav's enforcement pattern.
Suggested command: /impeccable harden

**[P2] The single featured project reads as arbitrary to a first-time visitor**
Why it matters: no visible label explaining the selection (pinned/latest); silent fallback to first project.
Fix: a small label near the card closes the gap cheaply.
Suggested command: /impeccable clarify

**[P3] Detector findings in 5 files need a one-off-vs-drift pass**
Why it matters: SettingsModal.vue, HeatGrid.vue, StatTile.vue, LanguageBars.vue, HeroSection.vue carry 9 advisory px-value findings not yet individually triaged.
Fix: quick pass to confirm intentional one-off vs. genuine drift.
Suggested command: /impeccable audit (scoped) or fold into next /impeccable document refresh

## Persona Red Flags

Jordan (first-timer): the entire "not a static portfolio" claim depends on noticing a single 9px dot (HeroSection.vue:112-119) — high risk of missing it entirely.

Sam (accessibility-dependent): hero dot's prefers-reduced-motion gating not directly confirmed at the selector level; BaseForm.vue's inline .err span has no confirmed role="alert"/aria-live.

Casey (mobile-user): the featured card (clamp(24px,4.5vw,34px) title, dense meta row, 3-line-clamped description) is the densest element on mobile Home — not confirmed broken, unverified without a screenshot.

## Minor Observations

- Hero headline's hand-drawn underline is a deliberate, on-brand personality touch.
- Nav labels capped to fit at 380px per a code comment, not enforced — long German translations could still overflow (unverified).
- Guestbook honeypot correctly implemented (tabindex="-1", aria-hidden="true").
- ProjectCard's hover-only-on-real-links discipline matches the codebase's stated rule.

## Questions to Consider

1. If the whole product's positioning is "it's alive," why does that proof rely on a visitor noticing a single 9px dot?
2. What happens to the guestbook wall after two years of entries — is unbounded growth a real plan, or untested?
3. Does showing exactly one silently-chosen featured project serve a peer developer better than showing 2-3 with equal weight?
