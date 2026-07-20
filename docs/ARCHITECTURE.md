# Architecture

How the code implements the ideas in [OVERVIEW](./OVERVIEW.md). Read this before
adding a source, a module, or a nav node. The playbooks for those live in
[guides/extending](./guides/extending.md); this doc explains the seams they rely
on.

## The one seam

```
GitHub / Wakapi                  packages/sources - one adapter per source
        |  fetch
        v
   normalize()                   the ONLY shape anything downstream sees
        |  persist
        v
   SQLite store                  packages/db - single source of truth,
        |  ^                      appends a snapshot (the archive) + upserts "current"
        |  |__ CMS writes         apps/server/src/routes/cms.ts (+ assets.ts)
        |  read
        v
 resolveSiteView()               packages/core - content + source data -> SiteView
        |
        v
   read API   ->   Astro SSR      apps/server/src/routes/read.ts -> apps/web (per request)
```

Everything visible is data-driven. The frontend renders a normalized `SiteView`
and never knows whether a module's data came from GitHub, Wakapi, or the CMS. That single rule, normalized data only and never a raw API shape, is what
makes "add a source cheaply" and "the site never goes stale" true at the same
time. It's recorded as [ADR-0005](./adr/0005-source-contract.md).

## Packages

| Package | Role |
|---|---|
| `@lg/core` | Contracts and pure logic, no runtime deps: `Localized` and locale helpers, the `NavNode` tree plus the nav lint, the content model, the `Source` contract and normalized source shapes, the engagement/guestbook/presence/asset types, the render-ready `SiteView`, and `resolveSiteView()`. |
| `@lg/db` | The SQLite store on `node:sqlite`: migrations plus repositories (content, source, IA, analytics, assets, guestbook, observed sessions, music, and the RAWG game-metadata cache) and the idempotent seed. The snapshot archive lives here. |
| `@lg/sources` | Pluggable source adapters, each real plus a deterministic mock: `github` (GraphQL) and `wakapi` (self-hosted WakaTime), and the registry that selects them by config. Also the RAWG adapter for game metadata (not a `Source` — a by-name lookup) and the parked Steam client. |
| `@lg/server` | Fastify: the read API, the CMS API and auth, contact, guestbook, presence, the engagement beacon, asset serving, the analytics dashboard, the in-process sync worker, and the in-process access-log ingest. |
| `@lg/web` | Astro SSR shell plus Vue islands: the public site, the `/admin` CMS, the on-site `/docs` renderer, and `/md/<slug>` pages for Markdown assets. |

## From boot to a rendered page

The server is one process (`apps/server/src/index.ts`). On start:

1. `loadEnv()` reads and validates configuration once. If the CMS is enabled but
   the cookie-signing secret is missing or still the dev default, it refuses to
   start (see [SECURITY](./SECURITY.md)).
2. `getStore(dbPath)` opens SQLite, applies the schema, seeds launch content if
   the store is empty, and reconciles the IA (so a new module kind added in code
   shows up without a manual migration).
3. `buildApp()` registers every route and the security headers, cookie signing,
   multipart, and CORS.
4. The sync worker starts. It runs each registered source once immediately, then
   on that source's own schedule. GitHub polls every 6 hours, Wakapi every 30
   minutes. Each run is fetch, normalize, persist (append a
   snapshot, upsert "current"). A maintenance pass rolls old hourly analytics
   into daily rows.
5. If an access log is configured, an ingest runs once at boot and then every 5
   minutes, incremental and idempotent.

On a request to `GET /api/site`, `resolveSiteView()` reads the current content,
source data, and nav from the store and returns fully resolved JSON: strings
localized for the requested locale, source data folded in, relative times and
heatmap buckets pre-computed. Astro's SSR page (`apps/web/src/pages/index.astro`)
fetches that per request through `apps/web/src/lib/site.ts`, which keeps a
15-second in-process cache so a burst of requests costs one API read. Because it
reads the local store rather than any external API, "nothing is fetched on page
load" still holds. A sync or a CMS edit is visible on the next request, no
rebuild.

SIGINT/SIGTERM stop the worker and the ingest task, close the server, and close
the store.

## Information architecture

The nav is a small, fixed set of themed areas. Features and data sources are
modules placed inside an area, never new tabs. A node is either a leaf (holds
`modules`) or a branch (holds two or more children with their own secondary nav).
The site scales by depth, not breadth: any one level stays at most five children,
and the tree grows deeper to a ceiling of three. A build-time lint
(`pnpm lint:nav`, from `packages/core/src/nav-lint.ts`) fails the build on a
broken tree. The rules, the four promotion gates, and the lint codes are in
[concepts/information-architecture](./concepts/information-architecture.md), and
the decision behind them is [ADR-0006](./adr/0006-recursive-nav-lint.md).

## Data and store

Three kinds of data share one store, kept strictly separate: CMS-owned content
(owner edits, localized), source-owned data (synced, normalized), and analytics
aggregates (anonymous counts). Source data lives in an append-only snapshot
archive plus a one-row-per-source "current" copy; the archive is why the store
outgrows the public API over time, and it can't be re-fetched, so it's what you
back up. The tables, the content model, and the resolved `SiteView` shape are in
[concepts/data-model](./concepts/data-model.md).

## Server routes

Grouped by purpose. The full request and response shapes, status codes, and auth
are in [reference/http-api](./reference/http-api.md).

- Public read: `GET /api/site`, `GET /health`.
- Public write, stores nothing personal: `POST /api/contact`,
  `POST /api/guestbook`, `POST /api/pulse` (the engagement beacon).
- Public presence: `GET /api/presence` (the server filters Lanyard, never the
  browser).
- Public assets: `GET /assets/:id`, `GET /assets/:id/:variant`,
  `GET /api/assets/md/:slug`.
- CMS, authed: content CRUD, the asset library and galleries, layout, guestbook
  moderation, and the analytics dashboard under `/api/cms/*`.
- Auth: GitHub OAuth login, callback, and logout under `/auth/*`.

Auth accepts either a signed session cookie (GitHub OAuth, one allowed login) or
a bearer `CMS_TOKEN`, and fails closed when neither is configured.

## Frontend

Astro renders the shell server-side and loads the `SiteView` per request. The
interactive part is a Vue island (`apps/web/src/components/TabbedSite.vue`):
tab switching, 3D tilt, staggered entrance, and the theme toggle, all disabled
under `prefers-reduced-motion`. `Module.vue` maps each module `kind` to a
component, so adding a module kind is a new branch there and nothing else on the
render path. The CMS at `/admin` is a separate client-only island. The `/docs`
pages are the repo's own Markdown, rendered at build time with the helpers in
`apps/web/src/lib/docs.ts` (which also decide the sidebar grouping, one group per
folder under `docs/`). Markdown assets uploaded through the CMS publish at
`/md/<slug>` in the same shell.

The client is pure presentation: it renders what the server resolved and caps,
counts, or infers nothing it wasn't given. Every visibility toggle and every list
limit — hardcoded or CMS-set — is enforced server-side (in the resolver, a query
`LIMIT`, or the day-drill-in routes), so the browser is never sent data it will
only hide or trim. See [The CMS](concepts/the-cms.md) for how the row caps and the
"and N more" totals work end to end.
