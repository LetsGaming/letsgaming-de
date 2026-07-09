# Overview

letsgaming.de is the personal homepage of Domenic (`@LetsGaming` on GitHub), a
web developer in Germany. It's data-driven, updates itself, and has a small
custom CMS behind it. The goal is that it reads like a person and not a company,
and shows more of what he makes than a GitHub profile would.

This doc is the current picture: what the site is, the ideas it's built on, what
ships today, and what's deliberately left for later. The decisions that were
expensive to reverse each have an entry in [adr/](./adr/README.md).

## Two things every decision answers to

Maintainability comes first. The site must not look stale after a month of nobody
touching it. Freshness lives in the backend, not in Domenic remembering to update
a page. A scheduled worker keeps the data current and the page just renders
what's there.

Scalability comes second. Adding content, or a whole new data source, has to be
cheap, and it must not bloat the navigation or slow anything down. One data seam
(normalized data only, see [ARCHITECTURE](./ARCHITECTURE.md)) and one navigation
rule (grow by depth, not breadth, see
[concepts/information-architecture](./concepts/information-architecture.md)) are
what make both true at once.

Alongside those sits a cultural rule: the CMS stays small and custom on purpose.
It does what this project needs and stops. It has grown since launch (an asset
library, a guestbook, a presence widget), but each addition was a deliberate,
bounded call rather than a slide toward Typo3 or WordPress. The reasoning is in
[concepts/the-cms](./concepts/the-cms.md).

## Principles

1. Everything visible is data-driven. The frontend renders normalized JSON and
   never knows which API the data came from.
2. The store is the single source of truth, and it holds only normalized data,
   never raw API shapes. That one seam buys both north stars.
3. Self-updating, not self-maintained. A scheduled backend keeps data current;
   the page renders what's there.
4. Group by theme, not by feature. Navigation maps to durable themes; features
   and data sources are modules placed inside a theme.
5. Scale by depth, not breadth. The nav is a recursive tree; any one level stays
   small, the tree grows as deep as it needs to.
6. Privacy by omission. If collecting data risks GDPR liability, don't collect
   it.
7. Keep the CMS small. Every proposed feature is measured against "does this
   project actually need it?"

## The stack

| Layer | Choice | Why, in one line |
|---|---|---|
| Language | TypeScript everywhere | one language across the whole stack |
| Backend | Fastify | schema-first validation and a plugin model that fit the modular design ([ADR-0002](./adr/0002-fastify-backend.md)) |
| Frontend | Astro shell + Vue islands, SSR | content-driven with near-zero JS, but live on every request ([ADR-0003](./adr/0003-astro-vue-ssr.md)) |
| Store | SQLite via `node:sqlite` | one file to back up, no native build step ([ADR-0009](./adr/0009-sqlite-node-sqlite.md)) |
| Repo | pnpm monorepo | shared contracts edited in one place ([ADR-0001](./adr/0001-monorepo-typescript-pnpm.md)) |
| Sync | in-process scheduled worker | polls each source on a cron; one container runs it beside the API |
| Sources | GitHub, Steam, Wakapi | pluggable adapters behind one contract ([ADR-0005](./adr/0005-source-contract.md), [ADR-0010](./adr/0010-multi-source.md)) |
| CMS auth | GitHub OAuth (single user) or a bearer token | fails closed when neither is set |
| Hosting | homelab, Docker | Compose-orchestrated behind a reverse proxy |
| Analytics | log-based aggregates + a cookieless engagement beacon | no cookies, no identifiers ([ADR-0007](./adr/0007-privacy-by-omission.md), [ADR-0012](./adr/0012-engagement-analytics.md)) |
| License | MIT, public repo | |

## Information architecture

The site is a small set of themed areas. Each area answers one question a
visitor has. Features and data sources are modules placed inside an area, never
a tab of their own by default. Adding content grows a section inside a theme; it
does not grow the nav.

| Area | Answers | Holds today |
|---|---|---|
| Home | who is this, quickly? | hero, featured project, at-a-glance stats |
| Work | what do you build? | activity (GitHub), highlights, coding time (Wakapi), projects |
| Life | who are you outside that? | hobbies, "right now", presence, guestbook, galleries |
| About | the longer story, and how to reach you | bio, contact |

A new nav node has to earn its place against four gates (distinct question,
enough weight to stand alone, homeless in every existing sibling, durable rather
than seasonal), and a build-time lint enforces the tree's shape so it can't rot
quietly. The full model, gates, and lint rules are in
[concepts/information-architecture](./concepts/information-architecture.md).

## Design

The look is locked from the prototype: chunky rounded cards with real depth,
springy interactions, purple-forward without drowning in it. Motion is 3D
tilt-on-hover, pressable buttons, staggered entrance, a pulsing status dot.
`prefers-reduced-motion` turns all of it off; that's a baseline, not an option.
Type is Fredoka for display, Inter for body, Space Mono for data, all
self-hosted. Both dark and light themes run off CSS custom-property tokens
(`apps/web/src/styles/tokens.css`) with `prefers-color-scheme` plus a persisted
manual toggle. The accessibility floor is mobile-responsive layout, visible
keyboard focus, reduced motion respected, and sufficient contrast in both themes.

## Privacy

If collecting data risks GDPR trouble, the site doesn't collect it. In practice:

- Analytics is anonymous aggregates only. Traffic stats come from parsing the
  reverse-proxy access log, and the IP is dropped at parse time. Engagement stats
  come from a cookieless beacon that sends already-bucketed events. No cookies,
  no identifiers, no per-visitor rows.
- The contact form relays to email and stores nothing.
- Fonts are self-hosted, so no request leaves the visitor's browser to a third
  party.
- A short static Datenschutzerklärung ships at `/datenschutz`. There is
  deliberately no Impressum. That's an eyes-open risk acceptance, not an
  oversight.

The full posture, including the legal reasoning and the upgrade paths kept in
mind but not built, is in
[concepts/analytics-and-privacy](./concepts/analytics-and-privacy.md).

## What ships today

All four areas are live, wired to GitHub, Steam, and Wakapi plus CMS content,
in both dark and light themes with the tactile look. Content is a mix of real
(the bio direction, real projects, actual GitHub and Steam data) and CMS-editable
copy. The CMS covers everything on the site that isn't pulled from an API:
identity, the home intro, bio, hobbies, links, "right now", the asset library and
galleries, presence curation, guestbook moderation, layout, and an analytics
dashboard. See [guides/using-the-cms](./guides/using-the-cms.md).

## Deferred

Built to slot in, not built yet:

- German locale content. Every human-authored field is already locale-keyed
  (`Localized`), so German is a content task in the CMS, not a migration.
- More data sources. The contract is proven across three; the next one is an
  adapter plus one registry line.
- Secondary-level nav UI. The tree is recursive in the schema and the lint
  already allows depth; the UI for a split node gets built the first time an
  area actually needs to split.
