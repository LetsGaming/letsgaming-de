# Docs rewrite: what changed

A full rewrite and reorganisation of `docs/` to match the code as it actually is,
plus fixes to the doc-like files outside `docs/`. Everything is written to age
well: one home per fact, shapes and invariants over pasted snapshots, and a
pointer to the file that owns each value.

## How to apply this

- Replace your `docs/` folder wholesale with the one here. It's self-contained;
  all prior content was carried forward, rewritten, or intentionally dropped (see
  below).
- Overlay the other files at their existing paths: `README.md`,
  `apps/server/README.md`, `apps/web/README.md`, `packages/core/README.md`,
  `packages/db/README.md`, `packages/sources/README.md`, `docker-compose.yml`.

## New structure

One level of subfolders, each with its own `README`. This matches the on-site
`/docs` renderer, which groups the sidebar by the first subfolder and sorts each
folder's `README` first.

```
docs/
  README.md            index / map
  OVERVIEW.md          was PROJECT.md, rewritten as a current overview
  ARCHITECTURE.md      updated + a runtime-lifecycle section
  CONTRIBUTING.md      refreshed (kept at root for GitHub)
  SECURITY.md          refreshed + a reporting section (kept at root for GitHub)
  concepts/            information-architecture, data-model, sources-and-sync,
                       analytics-and-privacy, the-cms, glossary
  reference/           http-api, configuration, commands
  guides/              using-the-cms, extending
  operations/          deployment, analytics-ingestion, backups, troubleshooting
  adr/                 0001-0014 (see ADR changes)
```

### File moves and renames

| Old | New |
|---|---|
| `PROJECT.md` | `OVERVIEW.md` (rewritten: no "ready to scaffold", no open items) |
| `API.md` | `reference/http-api.md` (rebuilt from the actual routes) |
| `CONFIGURATION.md` | `reference/configuration.md` (rebuilt from `env.ts`) |
| `DATA-MODEL.md` | `concepts/data-model.md` (rebuilt from `schema.sql`) |
| `USING-THE-CMS.md` | `guides/using-the-cms.md` |
| `DEPLOYMENT.md` | split into `operations/deployment.md`, `analytics-ingestion.md`, `backups.md` |
| `adr/0004-sqlite-node-sqlite.md` | `adr/0009-sqlite-node-sqlite.md` (renumbered) |

### New docs (didn't exist before)

`concepts/sources-and-sync.md`, `concepts/analytics-and-privacy.md`,
`concepts/the-cms.md`, `concepts/glossary.md`, `guides/extending.md` (playbooks
moved out of ARCHITECTURE), `operations/troubleshooting.md`, and a `README` in
each subfolder.

## The main correction: the CMS grew, and the docs now say so

The old docs (`PROJECT.md`, `ADR-0008`) insisted the CMS was small with no asset
library. The shipped CMS has a full asset library, a guestbook, and a presence
widget. Rather than paper over that, `concepts/the-cms.md` explains where the line
sits now, and new ADRs record the additions as deliberate, bounded decisions. The
"small CMS" rule still stands; it just moved.

## Other factual fixes (docs were stale versus code)

- Sources: "GitHub only" corrected to three sources (GitHub, Steam, Wakapi), each
  real plus a mock.
- API: removed the documented `/api/cms/media` and `/media/:file` (the `media.ts`
  route isn't even registered); added the asset endpoints, the guestbook (public
  submit and moderation), presence, and the engagement beacon `POST /api/pulse`.
  Rewrote the analytics endpoint (it's `?hours=` with a `chart`/`engagement`
  shape, plus a clear endpoint), not the old `?from=&to=`.
- Data model: added the missing tables (`assets`, `asset_variants`,
  `asset_folders`, `asset_tags`, `asset_usages`, `gallery`, `site_presence`,
  `guestbook`, `analytics_hourly`).
- Configuration: added the missing variables (`WAKAPI_*`, `STEAM_*`,
  `DISCORD_USER_ID`, `ACCESS_LOG`/`ACCESS_LOG_HOST`, `ANALYTICS_OWN_HOST`,
  `TRUST_PROXY`, `RETAIN_HOURLY_DAYS`) and documented the `ACCESS_LOG_HOST`
  to `ACCESS_LOG` mapping. Corrected the `SESSION_SECRET` note: the server now
  fails closed rather than falling back to a dev default.
- Analytics: documented the two systems (log-based traffic and the cookieless
  beacon), the hourly-to-daily rollup and retention, and that the IP is never
  captured.

## ADR changes

- `0004` (better-sqlite3) marked Superseded, kept as the historical record.
- `0009` is the `node:sqlite` decision (renumbered from the duplicate `0004`),
  which resolves the numbering collision.
- New: `0010` multi-source, `0011` asset library, `0012` engagement analytics,
  `0013` in-process log ingest, `0014` guestbook and presence.
- Existing ADRs: fixed dangling `PROJECT.md §N` cross-references (now point at
  `OVERVIEW`).

## Files changed outside docs/

| File | Change |
|---|---|
| `README.md` | pnpm 9 to the pinned version via corepack; three sources; fixed doc links; privacy note; removed emphasis-bold. |
| `apps/server/README.md` | removed the dead media route; added assets, guestbook, presence, track, analytics. |
| `apps/web/README.md` | added the `/docs` renderer, `/md/<slug>` pages, and `AssetPicture`. |
| `packages/core/README.md` | added the analytics/guestbook/presence/assets/format modules and the Steam/Wakapi outputs. |
| `packages/db/README.md` | added the assets and guestbook repos and tables; corrected the `openStore` shape. |
| `packages/sources/README.md` | "GitHub only" corrected to three sources. |
| `docker-compose.yml` | fixed the stale top comment that described analytics as a manual host cron. |

## Voice

Written to the two writing-style profiles: direct, active, concrete, no em-dashes
or en-dashes anywhere, no marketing vocabulary, sentence-case headings, minimal
bold, structure where it helps. Verified: zero em/en-dashes and zero hard-ban
words across the doc set.

## Worth knowing

- The on-site `/docs` URLs change with the reorg (for example `/docs/api` becomes
  `/docs/reference/http-api`). For a solo site that's usually fine. If you want the
  old URLs to keep working, add redirects; the slug mapping is the "file moves"
  table above.
- Source-code comments still reference `PROJECT.md §N` in a few places. Those are
  code, not docs, so they're left alone here. If you rename `PROJECT.md` in the
  repo, a find-and-replace of `PROJECT.md` to `OVERVIEW.md` in `apps/` and
  `packages/` comments would tidy them up.

## Naming: `letsgaming.de` (domain) vs `letsgaming-de` (repo)

The live domain is `letsgaming.de`; the repo and project are `letsgaming-de`. The
two were mixed in a few places. Audited every occurrence and split them:

- Kept `letsgaming.de` where it's the domain or brand: site URLs, `WEB_ORIGIN`,
  `PUBLIC_API_URL` (`api.letsgaming.de`), `ANALYTICS_OWN_HOST`, `no-reply@` email,
  page `<title>`s, the Astro `site:` config, and the `letsgaming.de-sync` /
  `letsgaming.de-cms` User-Agent strings. These identify the running site, not
  files or links, so they're correct as-is.
- Changed to `letsgaming-de` where it's the repo:

| File | Change | Type |
|---|---|---|
| `README.md` | CI badge GitHub URLs | docs |
| `docs/operations/backups.md` | volume name `letsgamingde_store` to `letsgaming-de_store` (matches `scripts/backup.sh`) | docs |
| `apps/web/src/lib/docs.ts` | `GITHUB_BLOB` repo URL | code |
| `apps/web/src/lib/docs.test.ts` | expected URLs to match `docs.ts` | code |
| `package.json` | root `name` (private, so cosmetic) | code |

The `docs.ts` one matters most: `GITHUB_BLOB` builds every on-site link from
`/docs` to a package README (and any file outside `docs/`). Pointed at
`letsgaming.de`, those links 404, since the repo is `letsgaming-de`.

The three code files need a rebuild, and `pnpm --filter @lg/web test` will confirm
the docs helper test still passes (the expectation was updated alongside the
constant). The scripts already use the repo name correctly
(`/apps/letsgaming-de/...`, `letsgaming-de_store`), so they were left alone.

## Analytics ingestion: standardized on `ACCESS_LOG` + a directory mount

Fixes the split that let the log ingest fail silently (compose read
`ACCESS_LOG_HOST` while the app hint and `.env` used `ACCESS_LOG`), and the
file-bind-mount staleness where an `mv`-based log pull froze the container's view.

- `docker-compose.yml`: the server now reads `ACCESS_LOG` directly (the variable
  the CMS hint and `.env` already use), and mounts `ACCESS_LOG_DIR` (the host log
  directory) read-only at `/logs`. Mounting the directory, not the file, means a
  rotated or `mv`-swapped log is picked up with no restart. A `logs_empty` named
  volume is the fallback when unset, so `docker compose up` is always valid.
- `.env.example`: the analytics block now documents `ACCESS_LOG_DIR` (host dir) +
  `ACCESS_LOG` (in-container path), and points at the ops doc, not the removed
  `DEPLOYMENT.md`. Also cleared its em-dashes.
- Docs: `reference/configuration.md`, `operations/analytics-ingestion.md`,
  `operations/troubleshooting.md`, and `adr/0013-in-process-log-ingest.md` updated
  to the new convention, with the failure-mode diagnostic (`printenv ACCESS_LOG`,
  the "ingest scheduled" log line) written into the ops docs.

Migration for the running deploy: in `.env`, replace
`ACCESS_LOG=/opt/lg/logs/access.log` with these two lines, then
`docker compose up -d` to recreate:

```dotenv
ACCESS_LOG_DIR=/opt/lg/logs
ACCESS_LOG=/logs/access.log
```

The systemd pull timer and its `mv`-based script stay exactly as they are; the
directory mount handles the swap.
