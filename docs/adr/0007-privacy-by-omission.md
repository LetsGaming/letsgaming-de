# 0007 — Privacy by omission

**Status:** Accepted · 2026 · (PROJECT.md §9)

## Context
The owner does not want to deal with DSGVO/GDPR exposure. If collecting data risks
liability, don't collect it.

## Decision
- Analytics is log-based aggregate counting: the IP is dropped at parse time; only
  anonymous per-day counts are stored. No cookies, no identifiers.
- Contact relays to email and stores nothing.
- Fonts are self-hosted — no third-party request.
- A short static Datenschutzerklärung ships; **no Impressum** (documented risk
  acceptance).

## Consequences
- No consent banner, no privacy-policy complexity for analytics.
- Can't report unique visitors/sessions without a hash — accepted; upgrade path to
  self-hosted Umami/Plausible noted but not built.
- Missing Impressum is a known Abmahnung risk, knowingly taken; a c/o-address
  Impressum is the fallback if it ever bites.
