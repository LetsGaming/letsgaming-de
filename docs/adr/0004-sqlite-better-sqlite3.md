# 0004: SQLite via better-sqlite3

**Status:** Superseded by [0009](./0009-sqlite-node-sqlite.md) · 2026

This was the original SQLite choice. It was later replaced by `node:sqlite` to
drop the native build step; the reasoning is in
[0009](./0009-sqlite-node-sqlite.md). The record is kept here for context.

## Context

Single-user, single-node, homelab. SQLite covers about 95% of anything this
project will ever need, and the store has to be trivial to back up and to reason
about.

## Decision

SQLite, accessed through better-sqlite3 (synchronous, battle-tested). The store is
the single source of truth and keeps every source snapshot (the archive). A
Postgres upgrade path exists but isn't planned.

## Consequences

- Backups are a file copy; the accumulated history is one artifact.
- Synchronous access keeps repositories simple.
- Native addon: normally a prebuilt binary, but if a registry lacks one the server
  image needs build tools. This friction is what eventually motivated the move to
  `node:sqlite`.
