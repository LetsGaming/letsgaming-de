/**
 * Where the dashboard's numbers are read from.
 *
 * Normally from the rollups: hour grain for hour-unit ranges, Berlin-day grain for
 * day-unit ranges, with the still-open bucket topped up live from the hourly rows
 * (inside the store). A day range in any other zone cannot use the Berlin-day
 * rollups, so it re-buckets the hourly rows into that zone's days instead. That
 * path is retention bound (about 90 days) and flagged `approximateZone`.
 */

import { SUMMARY_DIMENSIONS, summarize, type AnalyticsDimension, type SummaryValues } from "@lg/core";
import { ROLLUP_TIME_ZONE, zonedParts, type RollupGrain, type SeriesRow, type Store } from "@lg/db";
import type { Win } from "./window.js";

export interface KeyCount {
  key: string;
  count: number;
}

export interface Reader {
  /** The rollup grain in use, or null when day buckets are rebuilt from hourly rows. */
  readonly grain: RollupGrain | null;
  /** True when a day range was rebuilt in a zone other than the rollup zone. */
  readonly approximateZone: boolean;
  top(dimension: AnalyticsDimension, win: Win, limit?: number, keys?: readonly string[]): KeyCount[];
  series(dimension: AnalyticsDimension, win: Win, keys?: readonly string[]): SeriesRow[];
  /** One summary per bucket of `win` that has any data. */
  summaries(win: Win): Map<string, SummaryValues>;
}

/**
 * Re-bucket hourly rows into the reader's local calendar days.
 *
 * SQLite can group by `substr(bucket,1,10)`, but that is a UTC day, and a day
 * boundary is a wall-clock fact: in Europe/Berlin the 22:00 and 23:00 UTC hours
 * belong to the next local day. Done here in JS with `zonedParts`, the DST-exact
 * helper, over rows the process already holds from a local SQLite read.
 */
export function toLocalDays(rows: SeriesRow[], timeZone: string, from: string, to: string): SeriesRow[] {
  const merged = new Map<string, number>();
  for (const r of rows) {
    const day = zonedParts(Date.parse(`${r.bucket}:00:00Z`), timeZone).day;
    if (day < from || day > to) continue;
    const k = `${day}\u0000${r.key}`;
    merged.set(k, (merged.get(k) ?? 0) + r.count);
  }
  return [...merged.entries()].map(([k, count]) => {
    const [bucket, key] = k.split("\u0000");
    return { bucket: bucket!, key: key!, count };
  });
}

export function createReader(store: Store, unit: "hour" | "day", timeZone: string): Reader {
  const grain: RollupGrain | null = unit === "hour" ? "hour" : timeZone === ROLLUP_TIME_ZONE ? "day" : null;
  const approximateZone = unit === "day" && grain === null;

  /** A window whose buckets are in the grain being read (else it goes to the hourly rows). */
  const stored = (win: Win): { grain: RollupGrain; from: string; to: string } | null =>
    grain !== null && win.unit === grain ? { grain, from: win.from, to: win.to } : null;

  const hourlySeries = (dimension: AnalyticsDimension, win: Win, keys?: readonly string[]): SeriesRow[] => {
    const rows = store.analytics.seriesHourly(dimension, win.fromB, win.toB, "hour", keys);
    return win.unit === "day" ? toLocalDays(rows, timeZone, win.from, win.to) : rows;
  };

  return {
    grain,
    approximateZone,

    top(dimension, win, limit = 20, keys) {
      const s = stored(win);
      return s
        ? store.analytics.rollupTop(s.grain, dimension, s.from, s.to, limit, keys)
        : store.analytics.topHourly(dimension, win.fromB, win.toB, limit, keys);
    },

    series(dimension, win, keys) {
      const s = stored(win);
      return s ? store.analytics.rollupSeries(s.grain, dimension, s.from, s.to, keys) : hourlySeries(dimension, win, keys);
    },

    summaries(win) {
      const s = stored(win);
      if (s) return store.analytics.summaryByBucket(s.grain, s.from, s.to);
      const byBucket = new Map<string, { dimension: string; key: string; count: number }[]>();
      for (const dimension of SUMMARY_DIMENSIONS) {
        for (const r of hourlySeries(dimension, win)) {
          const list = byBucket.get(r.bucket) ?? [];
          list.push({ dimension, key: r.key, count: r.count });
          byBucket.set(r.bucket, list);
        }
      }
      return new Map([...byBucket].map(([bucket, rows]) => [bucket, summarize(rows)]));
    },
  };
}
