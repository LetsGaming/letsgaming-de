#!/usr/bin/env node
/**
 * Force a freshness state on a dev session's database, so every state a synced
 * module can show can be looked at without waiting for a real failure.
 *
 *   node scripts/dev-force-state.mjs --id <session-id> --source github --state stale
 *
 * States: fresh, stale, failed, never, empty. Sources: github, wakapi.
 *
 * It edits only `data/agent-<id>/letsgaming.sqlite`, the isolated database that
 * `dev-up.mjs --id <id>` created, and refuses anything else. The site view is
 * cached for about 15 seconds, so wait that long before reloading.
 *
 *   stale   rewinds the last sync to January 2026, past the source's TTL
 *   failed  records a sync failure newer than the last success (the last data stays)
 *   never   deletes the synced row, as if no sync had ever landed
 *   empty   keeps the sync time but empties the data
 *   fresh   stamps the sync as now and clears any recorded failure
 *
 * `empty` and `never` discard the mock data. `POST /api/cms/sync/<source>` on the
 * dev backend (token printed by dev-up) restores it. Wakapi re-syncs every 30
 * minutes and overwrites a forced state; use github for a long look.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = ["github", "wakapi"];
const STATES = ["fresh", "stale", "failed", "never", "empty"];

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const id = arg("id");
const source = arg("source") ?? "github";
const state = arg("state");

if (!id || !/^[a-z0-9][a-z0-9-]*$/i.test(id) || !SOURCES.includes(source) || !STATES.includes(state ?? "")) {
  console.error(`usage: node scripts/dev-force-state.mjs --id <session-id> [--source ${SOURCES.join("|")}] --state ${STATES.join("|")}`);
  process.exit(1);
}

const file = join(ROOT, "data", `agent-${id}`, "letsgaming.sqlite");
if (!existsSync(file)) {
  console.error(`no dev database for id "${id}" (looked for ${file}). Run: node scripts/dev-up.mjs --id ${id}`);
  process.exit(1);
}

const db = new DatabaseSync(file);
const now = new Date().toISOString();
try {
  const touchRow = (sql, ...params) => db.prepare(sql).run(...params);
  if (state === "stale") touchRow("UPDATE source_current SET synced_at = ? WHERE source_id = ?", "2026-01-01T00:00:00.000Z", source);
  if (state === "never") touchRow("DELETE FROM source_current WHERE source_id = ?", source);
  if (state === "empty") touchRow("UPDATE source_current SET data = 'null' WHERE source_id = ?", source);
  if (state === "failed") {
    touchRow(
      `INSERT INTO sync_status (source, last_error_at, last_error) VALUES (?, ?, 'forced by dev-force-state')
       ON CONFLICT(source) DO UPDATE SET last_error_at = excluded.last_error_at, last_error = excluded.last_error`,
      source,
      now,
    );
  }
  if (state === "fresh") {
    touchRow("UPDATE source_current SET synced_at = ? WHERE source_id = ?", now, source);
    touchRow("UPDATE sync_status SET last_error_at = NULL, last_error = NULL WHERE source = ?", source);
  }
  console.log(`forced ${source} to "${state}" in data/agent-${id}. Wait about 15 seconds, then reload.`);
} finally {
  db.close();
}
