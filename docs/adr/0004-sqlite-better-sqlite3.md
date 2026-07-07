# 0004 — SQLite via better-sqlite3

**Status:** Accepted · 2026

## Context
Single-user, single-node, homelab. Expected to cover ~95% of anything this project
will ever need. The store must be trivial to back up and to reason about.

## Decision
SQLite, accessed through better-sqlite3 (synchronous, battle-tested). The store is
the single source of truth and keeps every source snapshot (the archive). A
Postgres upgrade path exists but isn't planned.

## Consequences
- Backups are a file copy; the accumulated history is one artifact.
- Synchronous access keeps repositories simple.
- Native addon: normally a prebuilt binary; if a registry lacks one, the server
  image can add build tools (noted in the Dockerfile). Node's built-in
  `node:sqlite` is a fallback if ever needed.
