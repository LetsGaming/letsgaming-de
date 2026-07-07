import type { GitHubData, SourceData } from "@lg/core";
import type { DB } from "./database.js";

interface CurrentRow {
  source_id: string;
  synced_at: string;
  data: string;
}

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
      const json = JSON.stringify(data);
      const appendStmt = db.prepare(
        "INSERT INTO source_snapshots (source_id, synced_at, data) VALUES (?, ?, ?)",
      );
      const upsertStmt = db.prepare(
        `INSERT INTO source_current (source_id, synced_at, data) VALUES (?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET synced_at = excluded.synced_at, data = excluded.data`,
      );
      const tx = db.transaction(() => {
        appendStmt.run(sourceId, syncedAt, json);
        upsertStmt.run(sourceId, syncedAt, json);
      });
      tx();
    },

    /** Current normalized data for one source, or undefined if never synced. */
    getCurrent<T>(sourceId: string): T | undefined {
      const row = db
        .prepare("SELECT data FROM source_current WHERE source_id = ?")
        .get(sourceId) as { data: string } | undefined;
      return row ? (JSON.parse(row.data) as T) : undefined;
    },

    /** All current source data, assembled into the typed SourceData registry. */
    getAllCurrent(): SourceData {
      const rows = db.prepare("SELECT * FROM source_current").all() as unknown as CurrentRow[];
      const out: SourceData = {};
      for (const row of rows) {
        if (row.source_id === "github") out.github = JSON.parse(row.data) as GitHubData;
        // future sources get folded in here — one line each.
      }
      return out;
    },

    /** Newest sync time across all sources (for the "last updated" surface). */
    latestSyncedAt(): string | undefined {
      const row = db
        .prepare("SELECT MAX(synced_at) AS latest FROM source_current")
        .get() as { latest: string | null } | undefined;
      return row?.latest ?? undefined;
    },

    /** History for a source, newest first — the raw material for long-range trends. */
    history<T>(sourceId: string, limit = 100): { syncedAt: string; data: T }[] {
      const rows = db
        .prepare(
          "SELECT synced_at, data FROM source_snapshots WHERE source_id = ? ORDER BY synced_at DESC LIMIT ?",
        )
        .all(sourceId, limit) as { synced_at: string; data: string }[];
      return rows.map((r) => ({ syncedAt: r.synced_at, data: JSON.parse(r.data) as T }));
    },
  };
}

export type SourceRepo = ReturnType<typeof sourceRepo>;
