# letsgaming.de

Personal homepage for **Domenic** (`@LetsGaming`) — data-driven, self-updating,
with a deliberately small custom CMS. More than a GitHub mirror; it should feel
like a person, not a company.

- **Spec:** [`docs/PROJECT.md`](./docs/PROJECT.md) — every decision, locked.
- **How it's built:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — the seams + playbooks.
- **All docs:** [`docs/`](./docs/README.md) — API, data model, config, security, deployment, ADRs.

[![CI](https://github.com/LetsGaming/letsgaming.de/actions/workflows/ci.yml/badge.svg)](https://github.com/LetsGaming/letsgaming.de/actions/workflows/ci.yml)

## Stack

TypeScript everywhere · pnpm monorepo · **Astro + Vue islands** (SSR web) ·
**Fastify** (read API + CMS API + OAuth + sync worker) · **SQLite**
(node:sqlite) · GitHub as the first data source · Docker on a homelab. Dark +
light themes, tactile design, self-hosted fonts.

```
apps/
  web/       Astro + Vue islands — public site (SSR) + the /admin CMS
  server/    Fastify — read API, CMS API, OAuth, media, analytics, sync worker
packages/
  core/      contracts + resolver + nav lint (no runtime deps)
  db/        SQLite store: schema + repositories + seed
  sources/   pluggable adapters — github/ first
```

Each workspace has its own README with the details.

## Quickstart

Requires **Node ≥ 22.13** and **pnpm 9** (`corepack enable`).

```bash
pnpm install
pnpm --filter @lg/core build     # core is imported by the others
pnpm sync                        # fill the store (GitHub, or the mock without a token)
pnpm dev                         # API on :8787, site (SSR) on :4321
```

With no `GITHUB_TOKEN` set, the sync uses a deterministic **mock** GitHub source
so the site renders end to end offline. Copy `.env.example` → `.env` and add a
token for real data. The CMS lives at `/admin`.

## Commands

| Command | What |
|---|---|
| `pnpm dev` | Run server + web (SSR) in parallel |
| `pnpm dev:server` / `pnpm dev:web` | Run one |
| `pnpm sync` | Run every source once (fetch → normalize → persist) and exit |
| `pnpm analytics <access.log> [host]` | Ingest new log lines into anonymous aggregates |
| `pnpm lint:nav` | Fail if the nav breaks an information-architecture gate |
| `pnpm typecheck` | Typecheck every package (incl. `astro check`) |
| `pnpm test` | Unit/integration tests |
| `pnpm build` | Nav lint → build packages → server → web |

## How it stays fresh (self-updating)

Nothing external is fetched on page load. The in-process **sync worker** polls
each source on a schedule and writes normalized data to SQLite. The site is
**SSR**: every request resolves the current view from the read API (which reads
the local store), so a sync *or* a CMS edit shows up on the next request — no
rebuild. A short server-side cache keeps per-request cost to a sub-millisecond
SQLite read. Every sync is archived, so the store accrues history the public API
won't hand you directly (all-time totals, long-range trends).

## Privacy posture (§9)

- **Contact** relays to email and stores nothing (honeypot + rate limit).
- **Analytics** is log-based aggregate counting — the IP is dropped at parse
  time; only anonymous per-day counts are kept. No cookies, no identifiers.
- **Fonts are self-hosted** — no third-party request.
- A static **Datenschutzerklärung** ships at `/datenschutz`. No Impressum, by
  choice (§9 — risk accepted).

## License

MIT — see [`LICENSE`](./LICENSE). Public repo, all the way.
