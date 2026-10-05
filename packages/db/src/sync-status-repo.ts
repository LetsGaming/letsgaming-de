import type { DB } from "./database.js";
import { asNullableText, asText, mapRows } from "./row-mapper.js";

export interface SyncStatusRow {
  source: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

/** Last success / failure per background job. See `0017_sync_status.sql`. */
export function syncStatusRepo(db: DB) {
  return {
    recordSuccess(source: string, at: string): void {
      db.prepare(
        `INSERT INTO sync_status (source, last_success_at) VALUES (?, ?)
         ON CONFLICT(source) DO UPDATE SET
           last_success_at = excluded.last_success_at, last_error_at = NULL, last_error = NULL`,
      ).run(source, at);
    },

    /** Leaves `last_success_at` alone: a failure doesn't change when it last worked. */
    recordFailure(source: string, at: string, error: string): void {
      db.prepare(
        `INSERT INTO sync_status (source, last_error_at, last_error) VALUES (?, ?, ?)
         ON CONFLICT(source) DO UPDATE SET
           last_error_at = excluded.last_error_at, last_error = excluded.last_error`,
      ).run(source, at, error.slice(0, 500));
    },

    all(): SyncStatusRow[] {
      return mapRows(db.prepare("SELECT * FROM sync_status ORDER BY source"), (r) => ({
        source: asText(r.source),
        lastSuccessAt: asNullableText(r.last_success_at),
        lastErrorAt: asNullableText(r.last_error_at),
        lastError: asNullableText(r.last_error),
      }));
    },
  };
}

export type SyncStatusRepo = ReturnType<typeof syncStatusRepo>;
