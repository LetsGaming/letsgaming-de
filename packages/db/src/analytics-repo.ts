import type { AnalyticsDimension } from "@lg/core";
import type { DB } from "./database.js";
import { asNumber, asText, mapRow, mapRows, transact, type Row } from "./row-mapper.js";

// The vocabulary is core's — this file held a second copy of all sixteen, in a
// different order, and the store is the thing that refuses to record a dimension
// it doesn't know.
export type { AnalyticsDimension } from "@lg/core";

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

const toAnalyticsRow = (r: Row): AnalyticsRow => ({ key: asText(r.key), count: asNumber(r.count) });
const toSeriesRow = (r: Row): SeriesRow => ({
  bucket: asText(r.bucket),
  key: asText(r.key),
  count: asNumber(r.count),
});

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
      transact(db, () => {
        for (const h of hits) bump.run(h.day, h.dimension, h.key);
      });
    },

    /** Apply a batch of hour-bucketed engagement hits atomically. */
    recordHourly(hits: HourlyHit[]) {
      transact(db, () => {
        for (const h of hits) bumpHour.run(h.bucket, h.dimension, h.key);
      });
    },

    /** Top keys for a log dimension over an inclusive day range. */
    top(dimension: AnalyticsDimension, from: string, to: string, limit = 20): AnalyticsRow[] {
      return mapRows(
        db.prepare(
          `SELECT key, SUM(count) AS count FROM analytics_daily
           WHERE dimension = ? AND day BETWEEN ? AND ?
           GROUP BY key ORDER BY count DESC LIMIT ?`,
        ),
        toAnalyticsRow,
        dimension,
        from,
        to,
        limit,
      );
    },

    /** Total counts per day for a log dimension (coarse trend line). */
    trend(dimension: AnalyticsDimension, from: string, to: string): AnalyticsRow[] {
      return mapRows(
        db.prepare(
          `SELECT day AS key, SUM(count) AS count FROM analytics_daily
           WHERE dimension = ? AND day BETWEEN ? AND ?
           GROUP BY day ORDER BY day ASC`,
        ),
        toAnalyticsRow,
        dimension,
        from,
        to,
      );
    },

    /** Top keys for an engagement dimension over an inclusive hour-bucket range. */
    topHourly(dimension: AnalyticsDimension, fromB: string, toB: string, limit = 20): AnalyticsRow[] {
      return mapRows(
        db.prepare(
          `SELECT key, SUM(count) AS count FROM analytics_hourly
           WHERE dimension = ? AND bucket BETWEEN ? AND ?
           GROUP BY key ORDER BY count DESC LIMIT ?`,
        ),
        toAnalyticsRow,
        dimension,
        fromB,
        toB,
        limit,
      );
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
      return mapRows(
        db.prepare(
          `SELECT ${bucketExpr} AS bucket, key, SUM(count) AS count FROM analytics_hourly
           WHERE dimension = ? AND bucket BETWEEN ? AND ?
           GROUP BY ${bucketExpr}, key ORDER BY bucket ASC`,
        ),
        toSeriesRow,
        dimension,
        fromB,
        toB,
      );
    },

    /** Delete engagement rows in an inclusive hour-bucket range. Returns rows removed. */
    clearHourly(fromB: string, toB: string): number {
      return Number(
        db.prepare(`DELETE FROM analytics_hourly WHERE bucket BETWEEN ? AND ?`).run(fromB, toB).changes,
      );
    },

    /** Delete log rows in an inclusive day range. Returns rows removed. */
    clearDaily(fromD: string, toD: string): number {
      return Number(
        db.prepare(`DELETE FROM analytics_daily WHERE day BETWEEN ? AND ?`).run(fromD, toD).changes,
      );
    },

    /**
     * Storage retention: bundle hourly buckets older than `retainDays` into daily
     * rows (24 hours → 1 day), then delete the raw hourly rows. Keeps recent data
     * at hour resolution and long-term history at day resolution, so the volume
     * stays bounded no matter how long the site runs. Idempotent.
     */
    rollupAndPrune(retainDays: number): { rolledUp: number; pruned: number } {
      const cutoff = new Date(Date.now() - retainDays * 86_400_000).toISOString().slice(0, 13);
      return transact(db, () => {
        const rolledUp = Number(
          db
            .prepare(
              `INSERT INTO analytics_daily (day, dimension, key, count)
               SELECT substr(bucket, 1, 10) AS day, dimension, key, SUM(count)
               FROM analytics_hourly WHERE bucket < ?
               GROUP BY day, dimension, key
               ON CONFLICT(day, dimension, key) DO UPDATE SET count = count + excluded.count`,
            )
            .run(cutoff).changes,
        );
        const pruned = Number(
          db.prepare(`DELETE FROM analytics_hourly WHERE bucket < ?`).run(cutoff).changes,
        );
        return { rolledUp, pruned };
      });
    },

    getOffset(source: string): number {
      return (
        mapRow(
          db.prepare("SELECT offset FROM analytics_state WHERE source = ?"),
          (r) => asNumber(r.offset),
          source,
        ) ?? 0
      );
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
