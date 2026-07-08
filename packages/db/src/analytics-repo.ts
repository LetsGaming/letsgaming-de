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

/** One engagement hit, bucketed by UTC hour ("YYYY-MM-DDTHH"). */
export interface HourlyHit {
  bucket: string;
  dimension: AnalyticsDimension;
  key: string;
}

export interface AnalyticsRow {
  key: string;
  count: number;
}

/** A stacked series point: how many of `key` happened in `bucket`. */
export interface SeriesRow {
  bucket: string;
  key: string;
  count: number;
}

/** Repository for anonymous aggregate analytics. Never stores anything personal. */
export function analyticsRepo(db: DB) {
  const bump = db.prepare(
    `INSERT INTO analytics_daily (day, dimension, key, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(day, dimension, key) DO UPDATE SET count = count + 1`,
  );
  const bumpHour = db.prepare(
    `INSERT INTO analytics_hourly (bucket, dimension, key, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(bucket, dimension, key) DO UPDATE SET count = count + 1`,
  );

  return {
    /** Apply a batch of day-bucketed hits atomically (log-derived). */
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

    /** Apply a batch of hour-bucketed engagement hits atomically. */
    recordHourly(hits: HourlyHit[]) {
      db.exec("BEGIN");
      try {
        for (const h of hits) bumpHour.run(h.bucket, h.dimension, h.key);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },

    /** Top keys for a log dimension over an inclusive day range. */
    top(dimension: AnalyticsDimension, from: string, to: string, limit = 20): AnalyticsRow[] {
      return db
        .prepare(
          `SELECT key, SUM(count) AS count FROM analytics_daily
           WHERE dimension = ? AND day BETWEEN ? AND ?
           GROUP BY key ORDER BY count DESC LIMIT ?`,
        )
        .all(dimension, from, to, limit) as unknown as AnalyticsRow[];
    },

    /** Total counts per day for a log dimension (coarse trend line). */
    trend(dimension: AnalyticsDimension, from: string, to: string): AnalyticsRow[] {
      return db
        .prepare(
          `SELECT day AS key, SUM(count) AS count FROM analytics_daily
           WHERE dimension = ? AND day BETWEEN ? AND ?
           GROUP BY day ORDER BY day ASC`,
        )
        .all(dimension, from, to) as unknown as AnalyticsRow[];
    },

    /** Top keys for an engagement dimension over an inclusive hour-bucket range. */
    topHourly(dimension: AnalyticsDimension, fromB: string, toB: string, limit = 20): AnalyticsRow[] {
      return db
        .prepare(
          `SELECT key, SUM(count) AS count FROM analytics_hourly
           WHERE dimension = ? AND bucket BETWEEN ? AND ?
           GROUP BY key ORDER BY count DESC LIMIT ?`,
        )
        .all(dimension, fromB, toB, limit) as unknown as AnalyticsRow[];
    },

    /**
     * Per-time-bucket, per-key counts for an engagement dimension — the data
     * behind the stacked chart. `unit` picks hourly ("YYYY-MM-DDTHH") or daily
     * ("YYYY-MM-DD") buckets.
     */
    seriesHourly(
      dimension: AnalyticsDimension,
      fromB: string,
      toB: string,
      unit: "hour" | "day",
    ): SeriesRow[] {
      const bucketExpr = unit === "day" ? "substr(bucket, 1, 10)" : "bucket";
      return db
        .prepare(
          `SELECT ${bucketExpr} AS bucket, key, SUM(count) AS count FROM analytics_hourly
           WHERE dimension = ? AND bucket BETWEEN ? AND ?
           GROUP BY ${bucketExpr}, key ORDER BY bucket ASC`,
        )
        .all(dimension, fromB, toB) as unknown as SeriesRow[];
    },

    /** Delete engagement rows in an inclusive hour-bucket range. Returns rows removed. */
    clearHourly(fromB: string, toB: string): number {
      const info = db
        .prepare(`DELETE FROM analytics_hourly WHERE bucket BETWEEN ? AND ?`)
        .run(fromB, toB) as { changes?: number };
      return info.changes ?? 0;
    },

    /** Delete log rows in an inclusive day range. Returns rows removed. */
    clearDaily(fromD: string, toD: string): number {
      const info = db
        .prepare(`DELETE FROM analytics_daily WHERE day BETWEEN ? AND ?`)
        .run(fromD, toD) as { changes?: number };
      return info.changes ?? 0;
    },

    /**
     * Storage retention: bundle hourly buckets older than `retainDays` into daily
     * rows (24 hours → 1 day), then delete the raw hourly rows. Keeps recent data
     * at hour resolution and long-term history at day resolution, so the volume
     * stays bounded no matter how long the site runs. Idempotent.
     */
    rollupAndPrune(retainDays: number): { rolledUp: number; pruned: number } {
      const cutoff = new Date(Date.now() - retainDays * 86_400_000).toISOString().slice(0, 13);
      db.exec("BEGIN");
      try {
        const roll = db
          .prepare(
            `INSERT INTO analytics_daily (day, dimension, key, count)
             SELECT substr(bucket, 1, 10) AS day, dimension, key, SUM(count)
             FROM analytics_hourly WHERE bucket < ?
             GROUP BY day, dimension, key
             ON CONFLICT(day, dimension, key) DO UPDATE SET count = count + excluded.count`,
          )
          .run(cutoff) as { changes?: number };
        const prune = db
          .prepare(`DELETE FROM analytics_hourly WHERE bucket < ?`)
          .run(cutoff) as { changes?: number };
        db.exec("COMMIT");
        return { rolledUp: roll.changes ?? 0, pruned: prune.changes ?? 0 };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
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
