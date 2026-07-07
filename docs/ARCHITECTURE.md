# ARCHITECTURE.md

How the code implements the spec in `PROJECT.md`. Read this before adding a
source, a module, or a nav node — it explains the seams that keep the two north
stars (maintainability, scalability) intact.

## The one seam that buys everything

```
GitHub (+ future APIs)
   │  fetch                 packages/sources — one adapter per source
   ▼
normalize → GitHubData      the ONLY shape anything downstream sees
   │  persist
   ▼
SQLite store                packages/db — single source of truth, accumulates
   │  ▲                      snapshots (the archive) + upserts "current"
   │  └── CMS writes         apps/server/routes/cms.ts (owner-edited content)
   │  read
   ▼
resolveSiteView()           packages/core — content + source data → SiteView
   │
   ▼
read API  →  Astro SSR site  apps/server/routes/read.ts  →  apps/web (per request)
```

Everything visible is data-driven. The frontend renders a normalized `SiteView`
and never knows which data came from which API. That single seam — normalized
data only, never raw API shapes — is what makes both "add a data source cheaply"
and "the site never goes stale" true at once.

## Packages

| Package | Role |
|---|---|
| `@lg/core` | Contracts + pure logic: `Localized`, the `NavNode` tree + **nav lint**, the content model, the `Source` contract, the render-ready `SiteView`, and `resolveSiteView()`. No runtime deps. |
| `@lg/db` | SQLite store (better-sqlite3): schema + repositories (content, source, ia, analytics) + seed. The archive lives here. |
| `@lg/sources` | Pluggable adapters: `githubSource` (real, GraphQL) + `githubMockSource` (dev) + the registry. |
| `@lg/server` | Fastify: read API, CMS API + auth, media, analytics, and the in-process sync worker. |
| `@lg/web` | Astro (SSR) shell + Vue islands: the public site and the `/admin` CMS. |

## Information architecture (the anti-bloat idea)

The nav is a small, fixed set of themed **areas**; features and data sources are
**modules** placed inside an area, never new tabs. Adding content grows a section
within a theme; it does not grow the nav.

- **Areas & modules** — `packages/core/src/{nav,modules,ia}.ts`.
- **Recursive tree** — a node is a **leaf** (holds `modules`) or a **branch**
  (holds ≥2 children with their own secondary nav). Scale by **depth, not
  breadth**: any one level stays ≤5; the tree grows deeper (ceiling 3).
- **The four promotion gates** for a module to earn its own node: distinct
  question · weight to stand alone · homeless elsewhere · durable, not seasonal.

### The nav lint (build-time, not discipline)

`packages/core/src/nav-lint.ts`, run by `pnpm lint:nav`, **fails the build** on:
`MAX_CHILDREN` (>5), `MAX_DEPTH` (>3), `THIN_BRANCH` (<2 children), `EMPTY_LEAF`
(0 modules), `LEAF_AND_BRANCH` (both), `DUPLICATE_ID`, `DANGLING_MODULE` (leaf
points at an unknown module), `ORPHAN_MODULE` (a registered module no leaf places).

## Data model & store

- **CMS-owned** content (localized) lives in relational tables (`projects`,
  `hobbies`, `links`, `now_items`) plus two singletons (`site_content`,
  `site_ia`). Localized fields are JSON (`{"en":…,"de":…}`).
- **Source-owned** data lives in `source_snapshots` (append-only archive) and
  `source_current` (what the site reads). History can't be re-fetched — back it up.
- **Analytics** lives in `analytics_daily` (counts per day/dimension/key) and
  `analytics_state` (ingest offset). No personal data, ever.

## Server routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/site` | — | The resolved `SiteView` (what the site renders) |
| `GET /health` | — | Status + last sync time |
| `POST /api/contact` | — | Relay a message to email; stores nothing |
| `GET/PUT/DELETE /api/cms/*` | session/token | CRUD over owner content (schema-validated) |
| `POST/GET /api/cms/media` | session/token | Upload (→ WebP) / list images |
| `GET /media/:file` | — | Serve an uploaded image (read-only) |
| `GET /api/cms/analytics` | session/token | Aggregate dashboard data |
| `GET /auth/github/login` · `/callback` · `POST /auth/logout` | — | OAuth session |

Auth accepts either a signed session cookie (GitHub OAuth, single allowed login)
or a bearer `CMS_TOKEN`; it fails closed when neither is configured.

## Frontend

Astro SSR renders the shell and, per request, loads the `SiteView` from the read
API (`apps/web/src/lib/site.ts`, briefly cached). Interactivity is a Vue island
(`TabbedSite.vue`) that renders modules by kind (`Module.vue`), with tab
switching, 3D tilt, staggered entrance, and the theme toggle — all disabled under
`prefers-reduced-motion`. The CMS (`/admin`) is a separate client-only island.

## Playbooks

### Add a data source

1. Write an adapter implementing `Source<Raw, Normalized>` in `packages/sources`.
2. Add the normalized shape to `SourceData` in `packages/core/src/source.ts` and
   fold it into `sourceRepo.getAllCurrent()` (one line).
3. Register it in `packages/sources/src/registry.ts`.
4. Surface it in a module. The store, read API, and frontend don't change.

### Add a module (a feature/section)

1. Add a `ModuleKind` in `core/src/modules.ts` and its data to the
   `ResolvedModule` union in `view.ts`.
2. Handle the kind in `resolveSiteView()` (`resolve.ts`).
3. Add a branch for the kind in `apps/web/src/components/Module.vue`.
4. Place its id in a leaf's `modules` (seed/IA or the CMS). The nav is unchanged.

### Add / split a nav node

Edit the tree (`LAUNCH_NAV`, or the CMS). When an area gets heavy, split it into a
branch with sub-nodes — don't add a top-level sibling. `pnpm lint:nav` enforces
the gates; a straining top row means two areas share a parent question and should
merge under it.
