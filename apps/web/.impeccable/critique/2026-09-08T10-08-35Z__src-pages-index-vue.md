---
target: Home area (src/pages/index.vue) — AI-skeptical browser lens
total_score: 27
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
timestamp: 2026-09-08T10-08-35Z
slug: src-pages-index-vue
---
# Design Critique — letsgaming.de Homepage

**Method: dual-agent (A: a7fdbc6a9eb3ec06f · B: af768886b4e765dfd)**

## Design Health Score (Nielsen's 10 Heuristics)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Freshness states rendered explicitly everywhere |
| 2 | Match System / Real World | 4 | Plain-language section names, no jargon |
| 3 | User Control and Freedom | 3 | No "back to top," site short enough it rarely matters |
| 4 | Consistency and Standards | 4 | One documented, disciplined design system, actually followed |
| 5 | Error Prevention | 2 | Required-prop type contract silently broke and shipped rendering blank text |
| 6 | Recognition Rather Than Recall | 3 | Persistent 4-tab nav, short memorable labels |
| 7 | Flexibility and Efficiency | n/a | Not a relevant axis for a personal homepage |
| 8 | Aesthetic and Minimalist Design | 4 | Genuinely minimal empty states |
| 9 | Error Recovery | 3 | 500 page calm and on-brand; live form-validation error state unverified |
| 10 | Help and Documentation | n/a | Out of scope for a homepage review |
| **Total** | | **27/32** | **Good (84%)** |

## Design Specificity Verdict
Does not read as vibe-coded. No generic hero gradient blob, no glassmorphism, no uniform icon-grid, no fake testimonials/stats. Refuses to fabricate data ("not synced yet" instead of invented numbers). Detector's own "side-tab" AI-slop rule fired once on app.css:466 (blockquote left-border) — verified false positive. 29 total detector findings, 28 advisory (token drift, already triaged in same-session audit), 1 warning (the false positive above).

## Priority Issues

[P1] Guestbook form renders with blank labels and blank submit button — packages/core/dist/ui-messages.js is stale (built Aug 29, missing all guestbook* keys that exist in src/ui-messages.ts), causing t("guestbookFormName")/t("guestbookSend")/etc. to return undefined at runtime. Confirmed via live console warnings and zero "guestbook" occurrences in the built dist file. Fix: rebuild packages/core. Suggested command: /impeccable harden.

[P1] Cold-sync state stacks 4-5 "not synced yet" empty-state sentences with no visual differentiation, undermining the site's "it's alive" positioning on first impression. Suggested command: /impeccable onboard.

[P2] /about contact section shows only a mailto button, not the inline form PRODUCT.md describes — verify intended channel.kind config. Suggested command: /impeccable clarify.

## Persona Red Flags

Morgan (AI-Skeptical Browser): no template tells in first 10 seconds (no gradient mesh, no glow-as-depth, matching DESIGN.md's own No-Glow-As-Shadow rule). Full scroll shows consistent refusal to fabricate content. The one thing that would trip Morgan's radar is the blank Guestbook text (P1 above) — reads as "unreviewed" even though the actual cause is mundane build staleness, not generative sloppiness.

Casey (distracted mobile, 390px): 4-tab nav + settings fits one line, no wrapping. Main friction is the same stacked-empty-states issue eating more of the fold on a small screen.

## Minor Observations
- Dev-only Nuxt DevTools badge visible in screenshots; confirm absent from production build.
- CMS/admin token-hygiene findings (11px/10px literals, one inline-styled heading) already triaged in this session's /impeccable audit; nothing new.
- German locale rendered by default in review sessions, confirming Accept-Language locale detection is live.

## Questions to Consider
- Has a first-time visitor's cold-sync state actually been observed, or only ever seen warm?
- Could other consumers of @lg/core's build output be quietly stale the same way?
