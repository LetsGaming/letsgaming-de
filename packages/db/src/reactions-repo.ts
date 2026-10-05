import type { DB } from "./database.js";
import { asNumber, mapRow } from "./row-mapper.js";

/**
 * Global reaction counters: one integer per kind, no per-visitor data at all.
 * Statements are prepared per call so a read-only handle opened before the
 * writer has migrated doesn't fail at construction.
 */
export function reactionsRepo(db: DB) {
  return {
    count(kind: string): number {
      return (
        mapRow(db.prepare("SELECT count FROM reactions WHERE kind = ?"), (r) => asNumber(r.count), kind) ?? 0
      );
    },

    /** Add one and return the new total. */
    increment(kind: string): number {
      const row = db
        .prepare(
          `INSERT INTO reactions (kind, count) VALUES (?, 1)
           ON CONFLICT (kind) DO UPDATE SET count = count + 1
           RETURNING count`,
        )
        .get(kind) as { count: number };
      return asNumber(row.count);
    },
  };
}
