# Architecture decision records

Short, dated notes on the decisions that were expensive to reverse: the context,
the choice, and the consequences. Newer records supersede or extend older ones
explicitly, so a superseded record stays in place with a pointer rather than being
deleted.

| # | Decision | Status |
|---|---|---|
| [0001](./0001-monorepo-typescript-pnpm.md) | Monorepo, TypeScript everywhere, pnpm | Accepted |
| [0002](./0002-fastify-backend.md) | Fastify for the backend | Accepted |
| [0003](./0003-astro-vue-ssr.md) | Astro + Vue islands, SSR for self-updating | Accepted |
| [0004](./0004-sqlite-better-sqlite3.md) | SQLite via better-sqlite3 | Superseded by 0009 |
| [0005](./0005-source-contract.md) | The Source contract (normalized-only seam) | Accepted |
| [0006](./0006-recursive-nav-lint.md) | Recursive nav tree + build-time lint | Accepted |
| [0007](./0007-privacy-by-omission.md) | Privacy by omission | Accepted |
| [0008](./0008-small-custom-cms.md) | A small custom CMS, forever | Accepted |
| [0009](./0009-sqlite-node-sqlite.md) | SQLite via node:sqlite | Accepted (supersedes 0004) |
| [0010](./0010-multi-source.md) | More than one data source | Accepted |
| [0011](./0011-asset-library.md) | An asset library (a bounded DAM) | Accepted |
| [0012](./0012-engagement-analytics.md) | Cookieless engagement analytics | Accepted |
| [0013](./0013-in-process-log-ingest.md) | In-process access-log ingest | Accepted |
| [0014](./0014-guestbook-presence.md) | Guestbook and presence widget | Accepted |

The decisions from 0009 onward record where the project grew past its original
locked spec: a second and third data source, the asset library, the engagement
beacon, self-serve log ingest, and the guestbook and presence widget. Each stays
bounded and points back at the principle it extends.
