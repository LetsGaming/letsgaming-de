import type { GitHubData, SourceData, SteamData, WakapiData } from "@lg/core";
import type { DB } from "./database.js";
import { asNullableText, asText, json, mapRow, mapRows, type Row } from "./row-mapper.js";

/**
 * Repository for source-owned data. Every sync does two writes: append an
 * immutable snapshot (the archive — §4 accumulation) and upsert the "current"
 * copy the site reads. History can't be re-fetched, so the snapshot table is the
 * thing that must be backed up (§10).
 */
export function sourceRepo(db: DB) {
  return {
    /** Append + upsert in one transaction — a sync is atomic. */
    record(sourceId: string, syncedAt: string, data: unknown) {
      const payload = JSON.stringify(data);
      const appendStmt = db.prepare(
        "INSERT INTO source_snapshots (source_id, synced_at, data) VALUES (?, ?, ?)",
      );
      const upsertStmt = db.prepare(
        `INSERT INTO source_current (source_id, synced_at, data) VALUES (?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET synced_at = excluded.synced_at, data = excluded.data`,
      );
      db.exec("BEGIN");
      try {
        appendStmt.run(sourceId, syncedAt, payload);
        upsertStmt.run(sourceId, syncedAt, payload);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },

    /** Current normalized data for one source, or undefined if never synced. */
    getCurrent<T>(sourceId: string): T | undefined {
      return mapRow(
        db.prepare("SELECT data FROM source_current WHERE source_id = ?"),
        (r) => json<T>(r.data),
        sourceId,
      );
    },

    /** All current source data, assembled into the typed SourceData registry. */
    getAllCurrent(): SourceData {
      const rows = mapRows(db.prepare("SELECT source_id, data FROM source_current"), (r) => ({
        sourceId: asText(r.source_id),
        data: asText(r.data),
      }));
      const out: SourceData = {};
      for (const row of rows) {
        if (row.sourceId === "github") out.github = json<GitHubData>(row.data);
        else if (row.sourceId === "wakapi") out.wakapi = json<WakapiData>(row.data);
        else if (row.sourceId === "steam") out.steam = json<SteamData>(row.data);
        // future sources get folded in here — one line each.
      }
      return out;
    },

    /** Newest sync time across all sources (for the "last updated" surface). */
    latestSyncedAt(): string | undefined {
      return (
        mapRow(
          db.prepare("SELECT MAX(synced_at) AS latest FROM source_current"),
          (r) => asNullableText(r.latest),
        ) ?? undefined
      );
    },

    /** History for a source, newest first — the raw material for long-range trends. */
    history<T>(sourceId: string, limit = 100): { syncedAt: string; data: T }[] {
      return mapRows(
        db.prepare(
          "SELECT synced_at, data FROM source_snapshots WHERE source_id = ? ORDER BY synced_at DESC LIMIT ?",
        ),
        (r: Row) => ({ syncedAt: asText(r.synced_at), data: json<T>(r.data) }),
        sourceId,
        limit,
      );
    },
  };
}

export type SourceRepo = ReturnType<typeof sourceRepo>;
