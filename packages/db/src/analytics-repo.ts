import type { DB } from "./database.js";

export type AnalyticsDimension =
  // log-derived
  | "path"
  | "referrer"
  | "browser"
  | "os"
  | "device"
  // engagement (cookieless beacon)
  | "tab"
  | "exit"
  | "transition"
  | "dwell"
  | "scroll"
  | "session_tabs"
  | "session_dwell"
  | "click"
  | "project"
  | "viewport"
  | "theme";

export interface AnalyticsHit {
  day: string; // YYYY-MM-DD
  dimension: AnalyticsDimension;
  key: string;
}

export interface AnalyticsRow {
  key: string;
  count: number;
}

/** Repository for anonymous aggregate analytics. Never stores anything personal. */
export function analyticsRepo(db: DB) {
  const bump = db.prepare(
    `INSERT INTO analytics_daily (day, dimension, key, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(day, dimension, key) DO UPDATE SET count = count + 1`,
  );

  return {
    /** Apply a batch of hits atomically. */
    record(hits: AnalyticsHit[]) {
      db.exec("BEGIN");
      try {
        for (const h of hits) bump.run(h.day, h.dimension, h.key);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },

    /** Top keys for a dimension over an inclusive day range. */
    top(dimension: AnalyticsDimension, from: string, to: string, limit = 20): AnalyticsRow[] {
      return db
        .prepare(
          `SELECT key, SUM(count) AS count FROM analytics_daily
           WHERE dimension = ? AND day BETWEEN ? AND ?
           GROUP BY key ORDER BY count DESC LIMIT ?`,
        )
        .all(dimension, from, to, limit) as unknown as AnalyticsRow[];
    },

    /** Total counts per day for a dimension (coarse trend line). */
    trend(dimension: AnalyticsDimension, from: string, to: string): AnalyticsRow[] {
      return db
        .prepare(
          `SELECT day AS key, SUM(count) AS count FROM analytics_daily
           WHERE dimension = ? AND day BETWEEN ? AND ?
           GROUP BY day ORDER BY day ASC`,
        )
        .all(dimension, from, to) as unknown as AnalyticsRow[];
    },

    getOffset(source: string): number {
      const row = db.prepare("SELECT offset FROM analytics_state WHERE source = ?").get(source) as
        | { offset: number }
        | undefined;
      return row?.offset ?? 0;
    },
    setOffset(source: string, offset: number) {
      db.prepare(
        `INSERT INTO analytics_state (source, offset) VALUES (?, ?)
         ON CONFLICT(source) DO UPDATE SET offset = excluded.offset`,
      ).run(source, offset);
    },
  };
}

export type AnalyticsRepo = ReturnType<typeof analyticsRepo>;
