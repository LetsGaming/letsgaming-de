# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two confirmed audiences, both people who already know or are discovering Domenic (`@LetsGaming`) as a person, not cold leads:

- **Dev/gaming community** — peers who'd find the projects, GitHub activity, coding time, or game stats interesting on their own merit, independent of any professional context.
- **Friends & family** — people who know Domenic personally and check in on what he's up to.

Not primarily built for recruiters/professional evaluation, and not a solo tool with no audience — it's a social/personal presence for people who already have a relationship to the person behind it.

## Product Purpose

A personal homepage that updates itself. A scheduled backend worker keeps synced data (GitHub, Wakapi coding time, RAWG game metadata, Discord presence) current; the page always renders what's currently in the store, no manual refresh, no stale "last updated" page. A small custom CMS handles everything that isn't sourced data (bio, projects, hobbies, links, gallery, "now" items).

Success means the site never looks like it was abandoned after a month, without Domenic having to remember to touch it.

## Positioning

**It's alive.** A static resume or portfolio can only claim things ("I code regularly," "I play games"). This site's presence, activity, and playtime data update from real synced sources in near-real-time, so it demonstrates rather than claims. That's the one thing a GitHub profile, LinkedIn, or a hand-maintained portfolio site structurally can't do — they're all snapshots frozen at whenever someone last edited them.

## Operating Context

- Bilingual: English and German, switchable per-page via `?lang`, with `hreflang` alternates so both are indexed.
- Mobile and desktop web (no native app; a native wrapper would not count as a separate platform per this project's own definition).
- Self-hosted on a homelab via Docker Compose, behind a reverse proxy.
- Single-operator CMS: Domenic is the only editor, authenticated via GitHub OAuth or a bearer token.

## Capabilities and Constraints

- Information architecture is a themed-area tree, currently at its breadth cap (5 top-level areas: Home, Code, Life, About, and a hidden Blog) — any new top-level concept must nest as depth, not a new sibling, enforced by `pnpm lint:nav`.
- Data sources are pluggable adapters behind one normalized contract (GitHub, Wakapi, RAWG); each carries its own freshness TTL, and a synced module must render its actual state (`fresh`, `stale`, `empty`, `failed`, `never`) — never render stale data as if it were current.
- The CMS is deliberately kept small: every proposed feature is measured against "does this project actually need it," not grown toward a general-purpose CMS.
- Contact form relays to email and stores nothing server-side.
- No image-generation tool is available in this session, so any new-work visual pass proceeds code-first (comp-first requires image generation, which isn't present here).

## Brand Commitments

- Name: Domenic, handle `@LetsGaming` (GitHub and site identity).
- Voice: "should feel like a person, not a company" — this is a stated, binding brand commitment, not a style suggestion.
- Public, MIT-licensed repository — the whole codebase is itself part of the public presence, not just the rendered site.

## Evidence on Hand

- Real synced data: GitHub repos/activity/contributions, Wakapi coding-time stats, RAWG game metadata, Discord presence/playtime.
- Real user-generated content: a pre-moderated guestbook (visitor-submitted, not fabricated).
- No testimonials, case studies, client logos, or usage benchmarks exist or should be invented — this is a personal site with no clients.

## Product Principles

1. Everything visible is data-driven — the frontend renders normalized data and never knows or cares which upstream API it came from.
2. Self-updating, not self-maintained — freshness is a backend/scheduling property, never something a human has to remember to do.
3. Scale by depth, not breadth — the nav is a recursive tree with a hard breadth cap; growth means going deeper into an existing theme, not adding a new top-level concept.
4. Privacy by omission — if collecting a kind of data risks GDPR liability, it isn't collected, full stop.
5. Keep the CMS small — every feature addition is a deliberate, bounded call weighed against actual need, not organic growth toward a general CMS.

## Accessibility & Inclusion

No formal compliance standard (e.g. WCAG AA) is a fixed requirement. An accessibility floor is already established practice and should be preserved, not treated as optional: mobile-responsive layout, visible keyboard focus, reduced motion respected, and sufficient contrast in both light and dark themes.
