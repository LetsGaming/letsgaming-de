# @lg/db

The SQLite store on `node:sqlite` (built into Node), the single source of truth.

| Path | Role |
|---|---|
| `schema.sql` | CMS tables, the asset library, the guestbook, the source snapshot archive + current, and the analytics aggregates. |
| `content-repo.ts` | Read the full `SiteContent` + CRUD for the CMS. |
| `source-repo.ts` | Append a snapshot + upsert current; read current and history. The archive accrues data the public API won't hand you directly. |
| `ia-repo.ts` | Read and write the nav tree + module registry. |
| `analytics-repo.ts` | Increment and read anonymous aggregates; ingest offset; hourly-to-daily rollup. |
| `assets-repo.ts` | Assets, variants, folders, tags, and usage tracking. |
| `guestbook-repo.ts` | Submit, moderate, and list approved entries. |
| `seed.ts` | Idempotent launch seed (content + IA) and IA reconciliation. |
| `index.ts` | `openStore(path)` returns `{ content, source, ia, analytics, assets, guestbook, close }`. |

Uses `node:sqlite`, so no native build step and no node-gyp. The schema is the
source of truth; see [`docs/concepts/data-model.md`](../../docs/concepts/data-model.md).
