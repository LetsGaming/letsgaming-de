# @lg/db

The SQLite store (node:sqlite, built into Node) — the single source of truth.

- **`schema.sql`** — CMS tables, the source snapshot archive + current, and the
  analytics aggregates.
- **`content-repo.ts`** — read the full `SiteContent` + CRUD for the CMS.
- **`source-repo.ts`** — append a snapshot + upsert current; read current /
  history. The archive accrues data the public API won't hand you directly.
- **`ia-repo.ts`** — read/write the nav tree + module registry.
- **`analytics-repo.ts`** — increment/read anonymous aggregates; ingest offset.
- **`seed.ts`** — idempotent launch seed (content + IA).
- **`index.ts`** — `openStore(path)` → `{ content, source, ia, analytics, close }`.

Uses `node:sqlite` (built into Node) — no native build step, no node-gyp.
