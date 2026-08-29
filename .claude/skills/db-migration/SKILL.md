---
name: db-migration
description: Scaffold a new SQLite migration file in packages/db/src/migrations following this repo's forward-only, checksum-verified migration convention. Use when the user asks to add/change a table, column, or index in the store schema.
disable-model-invocation: true
---

# DB Migration Scaffolding

Full rules: `packages/db/src/migrations/README.md`. This skill exists so the numbering and checksum rules aren't reinvented each time.

## Hard rules (from the runner in `packages/db/src/migrate.ts`)

- **Forward-only and immutable.** Once a migration file has been applied anywhere, editing it is a hard error (checksum mismatch). Never edit an existing migration — write a new one.
- **Naming:** `NNNN_short_description.sql`, zero-padded, next number after the highest existing file in `packages/db/src/migrations/`.
- **One concern per file.** The runner wraps each file in a transaction.
- Prefer additive DDL (new tables/columns/indexes) over destructive changes.

## Steps

1. `ls packages/db/src/migrations/*.sql` to find the highest existing number.
2. Create `packages/db/src/migrations/NNNN_<description>.sql` (next number, snake_case description).
3. Write plain SQL. Match the existing style: `CREATE TABLE IF NOT EXISTS`, inline comments explaining non-obvious columns (see `0001_init.sql` for the schema's shape and comment style), `CREATE INDEX IF NOT EXISTS` for new indexes.
4. Do not touch `dist/migrations` — the build step (`pnpm --filter=@lg/db build`) copies `src/migrations` there.
5. If the schema change affects repository/query code in `packages/db/src/`, update that in the same change.
6. Run `pnpm --filter=@lg/db build && pnpm --filter=@lg/db test` to confirm the migration applies cleanly (the runner applies pending migrations automatically on `openDatabase()`).
