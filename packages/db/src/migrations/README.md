# Migrations

The store schema is defined here and applied by `../migrate.ts`.

## Rules

- **Forward-only and immutable.** Each file is applied once, in numeric order, and
  recorded in `schema_migrations` with a sha256 checksum. Once a migration has been
  applied anywhere, **never edit it** — the runner treats a changed checksum as a
  hard error. Add a new file instead.
- **Naming:** `NNNN_short_description.sql` (zero-padded, e.g. `0002_add_tags.sql`).
- **One concern per file**, wrapped implicitly in a transaction by the runner (each
  migration commits or rolls back as a unit).

## The baseline

`0001_init.sql` is an idempotent baseline (`CREATE TABLE IF NOT EXISTS`). It creates
the full schema on a fresh database, and no-ops on a database that predates the
runner (which then simply records the baseline as applied). Connection pragmas
(WAL, `synchronous`, `foreign_keys`, `busy_timeout`) are **not** here — they are set
per connection in `database.ts`.

## Adding a migration

1. Create `packages/db/src/migrations/000N_description.sql`.
2. Write plain SQL (DDL/DML). Prefer additive changes.
3. It applies automatically on next `openDatabase()` (boot, tests, dev).

The build copies this directory to `dist/migrations` so it ships with the package.
