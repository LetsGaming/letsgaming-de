# @lg/db

The SQLite store (better-sqlite3) — the single source of truth.

- **`schema.sql`** — CMS tables, the source snapshot archive + current, and the
  analytics aggregates.
- **`content-repo.ts`** — read the full `SiteContent` + CRUD for the CMS.
- **`source-repo.ts`** — append a snapshot + upsert current; read current /
  history. The archive accrues data the public API won't hand you directly.
- **`ia-repo.ts`** — read/write the nav tree + module registry.
- **`analytics-repo.ts`** — increment/read anonymous aggregates; ingest offset.
- **`seed.ts`** — idempotent launch seed (content + IA).
- **`index.ts`** — `openStore(path)` → `{ content, source, ia, analytics, close }`.

Uses Node-native build tooling only via prebuilt binaries; see the Dockerfile note
if a registry lacks one.
