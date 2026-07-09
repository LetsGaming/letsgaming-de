# letsgaming.de

Personal homepage for Domenic (`@LetsGaming`): data-driven, self-updating,
with a small custom CMS. More than a GitHub mirror; it should feel like a person,
not a company.

- What it is: [`docs/OVERVIEW.md`](./docs/OVERVIEW.md), the principles, scope,
  and roadmap.
- How it's built: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), the seams
  and the runtime lifecycle.
- All docs: [`docs/`](./docs/README.md), reference, concepts, guides,
  operations, and the decision log.

[![CI](https://github.com/LetsGaming/letsgaming.de/actions/workflows/ci.yml/badge.svg)](https://github.com/LetsGaming/letsgaming.de/actions/workflows/ci.yml)

## Stack

TypeScript everywhere, pnpm monorepo. Astro + Vue islands (SSR web).
Fastify (read API, CMS API, OAuth, sync worker). SQLite via `node:sqlite`.
Three data sources (GitHub, Steam, Wakapi) behind one contract. Docker on a
homelab. Dark and light themes, tactile design, self-hosted fonts.

```
apps/
  web/       Astro + Vue islands, public site (SSR) + the /admin CMS
  server/    Fastify, read API + CMS API + OAuth + media + analytics + sync worker
packages/
  core/      contracts + resolver + nav lint (no runtime deps)
  db/        SQLite store: schema + repositories + seed
  sources/   pluggable adapters: github, steam, wakapi
```

Each workspace has its own README with the details.

## Quickstart

Requires Node 22.13+ and pnpm via `corepack enable` (the version is
pinned in `package.json`).

```bash
pnpm install
pnpm --filter @lg/core build     # core is imported by the others
pnpm sync                        # fill the store (GitHub, or the mock without a token)
pnpm dev                         # API on :8787, site (SSR) on :4321
```

With no `GITHUB_TOKEN` set, the sync uses a deterministic mock GitHub source,
so the site renders end to end offline. Copy `.env.example` to `.env` and add a
token for real data. The CMS lives at `/admin`.

## Commands

| Command | What |
|---|---|
| `pnpm dev` | Run server + web (SSR) in parallel |
| `pnpm dev:server` / `pnpm dev:web` | Run one |
| `pnpm sync` | Run every source once (fetch, normalize, persist) and exit |
| `pnpm analytics <access.log> [host]` | Ingest new log lines into anonymous aggregates |
| `pnpm lint:nav` | Fail if the nav breaks an information-architecture gate |
| `pnpm typecheck` | Typecheck every package (incl. `astro check`) |
| `pnpm test` | Unit and integration tests |
| `pnpm build` | Nav lint, then build packages, server, web |

Full command reference: [`docs/reference/commands.md`](./docs/reference/commands.md).

## How it stays fresh

Nothing external is fetched on page load. The in-process sync worker polls
each source on a schedule and writes normalized data to SQLite. The site is
SSR: every request resolves the current view from the read API (which reads
the local store), so a sync or a CMS edit shows up on the next request, no
rebuild. A short server-side cache keeps per-request cost to a sub-millisecond
SQLite read. Every sync is archived, so the store accrues history the public API
won't hand you directly (all-time totals, long-range trends).

## Privacy

- Contact relays to email and stores nothing (honeypot + rate limit).
- Analytics is anonymous aggregate counting: the IP is dropped at parse time,
  and a cookieless beacon carries already-bucketed engagement. No cookies, no
  identifiers.
- Fonts are self-hosted, so no third-party request.
- A static Datenschutzerklärung ships at `/datenschutz`. No Impressum, by
  choice. See
  [`docs/concepts/analytics-and-privacy.md`](./docs/concepts/analytics-and-privacy.md).

## License

MIT, see [`LICENSE`](./LICENSE). Public repo, all the way.
