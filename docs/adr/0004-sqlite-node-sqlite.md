# 0004 — SQLite via node:sqlite

**Status:** Accepted · 2026 · supersedes an earlier better-sqlite3 choice

## Context
Single-user, single-node, homelab. SQLite covers ~95% of anything this project
will ever need, and the store must be trivial to back up. An earlier iteration
used **better-sqlite3**, but its native addon caused repeated friction: no
prebuilt binary for newer Node (e.g. Node 24) meant a `node-gyp` build, which
fails on machines without a C toolchain (a real Windows dev failure) and adds a
build step to Docker and CI.

## Decision
Use Node's built-in **`node:sqlite`** (`DatabaseSync`) — synchronous, zero
native dependencies. This removes node-gyp/prebuild from local dev, Docker, and
CI entirely. It requires **Node ≥ 22.13** (where `node:sqlite` is usable without
a flag), so that becomes the engine floor.

## Consequences
- No native build anywhere; `pnpm install` never touches a compiler.
- Backups are still a single file copy; the archive is one artifact.
- Transactions use explicit `BEGIN`/`COMMIT`/`ROLLBACK` (no `db.transaction()`
  helper); repositories wrap their multi-write operations accordingly.
- `node:sqlite` is marked experimental and emits a startup warning — harmless,
  and stable in practice on the supported Node versions.
- Node 20 is dropped. If a future need arises, better-sqlite3\@12 (which ships
  Node 24 prebuilts) is the drop-in fallback.
