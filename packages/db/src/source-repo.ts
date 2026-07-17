import { isSourceId, type GitHubData, type SourceData, type SourceId, type SteamData, type WakapiData } from "@lg/core";
import type { DB } from "./database.js";
import { asNullableText, asText, json, mapRow, mapRows, transact, type Row } from "./row-mapper.js";

/**
 * Repository for source-owned data. Every sync does two writes: append an
 * immutable snapshot (the archive — §4 accumulation) and upsert the "current"
 * copy the site reads. History can't be re-fetched, so the snapshot table is the
 * thing that must be backed up (§10).
 */

/** Snapshots per `history()` page — enough for a trend, small enough to hold. */
const HISTORY_LIMIT = 100;

export function sourceRepo(db: DB) {
  return {
    /** Append + upsert in one transaction — a sync is atomic. */
    record(sourceId: SourceId, syncedAt: string, data: unknown) {
      const payload = JSON.stringify(data);
      const appendStmt = db.prepare(
        "INSERT INTO source_snapshots (source_id, synced_at, data) VALUES (?, ?, ?)",
      );
      const upsertStmt = db.prepare(
        `INSERT INTO source_current (source_id, synced_at, data) VALUES (?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET synced_at = excluded.synced_at, data = excluded.data`,
      );
      transact(db, () => {
        appendStmt.run(sourceId, syncedAt, payload);
        upsertStmt.run(sourceId, syncedAt, payload);
      });
    },

    /** Current normalized data for one source, or undefined if never synced. */
    getCurrent<T>(sourceId: SourceId): T | undefined {
      return mapRow(
        db.prepare("SELECT data FROM source_current WHERE source_id = ?"),
        (r) => json<T>(r.data),
        sourceId,
      );
    },

    /**
     * All current source data, assembled into the typed SourceData registry.
     *
     * `source_id` is TEXT, so a row for a retired source (or a typo in an old
     * write) is a string with no field to land in — hence the narrowing rather
     * than an if-chain of literals: the chain silently dropped anything it didn't
     * name, and had to be edited by hand for every new source.
     */
    getAllCurrent(): SourceData {
      const rows = mapRows(db.prepare("SELECT source_id, data FROM source_current"), (r) => ({
        sourceId: asText(r.source_id),
        data: asText(r.data),
      }));
      const out: SourceData = {};
      for (const row of rows) {
        if (!isSourceId(row.sourceId)) continue; // a source we no longer know about
        // The id determines the shape; the mapping is the SourceData contract.
        if (row.sourceId === "github") out.github = json<GitHubData>(row.data);
        else if (row.sourceId === "wakapi") out.wakapi = json<WakapiData>(row.data);
        else if (row.sourceId === "steam") out.steam = json<SteamData>(row.data);
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

    /** Last successful sync per source. `latestSyncedAt` collapses these to a
     *  single max, which is fine for a "last updated" line and useless for
     *  staleness — GitHub being 7h old says nothing about Discord. */
    syncedAtBySource(): Partial<Record<SourceId, string>> {
      const rows = mapRows(db.prepare("SELECT source_id, synced_at FROM source_current"), (r) => ({
        sourceId: asText(r.source_id),
        syncedAt: asText(r.synced_at),
      }));
      const out: Partial<Record<SourceId, string>> = {};
      for (const row of rows) {
        if (isSourceId(row.sourceId)) out[row.sourceId] = row.syncedAt;
      }
      return out;
    },

    /** History for a source, newest first — the raw material for long-range trends. */
    history<T>(sourceId: SourceId, limit = HISTORY_LIMIT): { syncedAt: string; data: T }[] {
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
