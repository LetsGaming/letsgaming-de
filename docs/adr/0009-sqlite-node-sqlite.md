# 0009: SQLite via node:sqlite

**Status:** Accepted · 2026 · supersedes [0004](./0004-sqlite-better-sqlite3.md)

## Context

Single-user, single-node, homelab. SQLite covers about 95% of anything this
project will ever need, and the store has to be trivial to back up. An earlier
iteration used better-sqlite3 ([ADR-0004](./0004-sqlite-better-sqlite3.md)), but
its native addon caused repeated friction. There was no prebuilt binary for newer
Node (Node 24, for example), which meant a `node-gyp` build, which fails on
machines without a C toolchain (a real Windows dev failure) and adds a build step
to Docker and CI.

## Decision

Use Node's built-in `node:sqlite` (`DatabaseSync`), synchronous and with zero
native dependencies. This removes node-gyp and prebuilds from local dev, Docker,
and CI entirely. It requires Node 22.13 or newer (where `node:sqlite` is usable
without a flag), so that becomes the engine floor.

## Consequences

- No native build anywhere; `pnpm install` never touches a compiler.
- Backups are still a single file copy; the archive is one artifact.
- Transactions use explicit `BEGIN`/`COMMIT`/`ROLLBACK` (there's no
  `db.transaction()` helper), so repositories wrap their multi-write operations
  accordingly.
- `node:sqlite` is marked experimental and prints a startup warning. Harmless, and
  stable in practice on the supported Node versions.
- Node 20 is dropped. If a future need arises, better-sqlite3@12 (which ships Node
  24 prebuilts) is the drop-in fallback.
