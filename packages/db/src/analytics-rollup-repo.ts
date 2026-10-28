import {
  SUMMARY_METRICS,
  emptySummary,
  summarize,
  summaryMetricsOf,
  type SummaryMetric,
  type SummaryValues,
} from "@lg/core";
import type { DB } from "./database.js";
import { asNumber, asText, mapRow, mapRows, transact, type Row } from "./row-mapper.js";
import { ROLLUP_TIME_ZONE, bucketDay, dayHourSpan, hourBucket, localDayStartMs, shiftDay } from "./tz.js";

export type RollupGrain = "hour" | "day";

export interface RollupState {
  /** Newest bucket the last job computed; it may still have been open then. */
  through: string;
  computedAt: string;
  /** Day grain holds legacy UTC-day rows folded in unchanged. */
  approx: boolean;
}

export interface RollupKeyRow {
  key: string;
  count: number;
}

export interface RollupSeriesRow {
  bucket: string;
  key: string;
  count: number;
}

/** Hour rollups are only read for short ranges, so they are kept this long. */
const HOUR_ROLLUP_RETAIN_DAYS = 14;
const MS_PER_DAY = 86_400_000;
const PAIR_DIMENSION_PREFIX = "x:%";

/** The summary dimension's counters, as `{ dimension, key, count }`. */
type CounterRow = { dimension: string; key: string; count: number };
const toCounter = (r: Row): CounterRow => ({ dimension: asText(r.dimension), key: asText(r.key), count: asNumber(r.count) });

const inList = (keys: readonly string[]): string => keys.map(() => "?").join(",");

/**
 * Materialized rollups over `analytics_hourly`: per-bucket recompute, the read
 * side that merges stored buckets with a live top-up for the open one, and the
 * retention step that only drops an hour once its Berlin day is stored.
 */
export function rollupRepo(db: DB) {
  /** The inclusive UTC hour span a bucket covers. */
  const spanOf = (grain: RollupGrain, bucket: string): { fromB: string; toB: string } =>
    grain === "hour" ? { fromB: bucket, toB: bucket } : dayHourSpan(bucket, ROLLUP_TIME_ZONE);

  const hasHourly = db.prepare("SELECT 1 FROM analytics_hourly WHERE bucket BETWEEN ? AND ? LIMIT 1");
  const hasRollup = db.prepare("SELECT 1 FROM analytics_rollup WHERE grain = ? AND bucket = ? LIMIT 1");
  const delRollup = db.prepare("DELETE FROM analytics_rollup WHERE grain = ? AND bucket = ?");
  const delSummary = db.prepare("DELETE FROM analytics_summary WHERE grain = ? AND bucket = ?");
  const insRollup = db.prepare(
    `INSERT INTO analytics_rollup (grain, bucket, dimension, key, count)
     SELECT ?1, ?2, dimension, key, SUM(count) FROM analytics_hourly
     WHERE bucket BETWEEN ?3 AND ?4 AND dimension NOT LIKE '${PAIR_DIMENSION_PREFIX}'
     GROUP BY dimension, key`,
  );
  const readRollup = db.prepare("SELECT dimension, key, count FROM analytics_rollup WHERE grain = ? AND bucket = ?");
  const insSummary = db.prepare("INSERT INTO analytics_summary (grain, bucket, metric, value) VALUES (?, ?, ?, ?)");
  const liveStmt = db.prepare(
    `SELECT dimension, key, SUM(count) AS count FROM analytics_hourly
     WHERE bucket BETWEEN ? AND ? AND dimension NOT LIKE '${PAIR_DIMENSION_PREFIX}'
     GROUP BY dimension, key`,
  );

  const getState = (grain: RollupGrain): RollupState | null =>
    mapRow(
      db.prepare("SELECT through, computed_at, approx FROM analytics_rollup_state WHERE grain = ?"),
      (r) => ({ through: asText(r.through), computedAt: asText(r.computed_at), approx: asNumber(r.approx) === 1 }),
      grain,
    ) ?? null;

  /** Counters of one bucket straight from the hourly rows (the open-bucket top-up). */
  const liveCounters = (grain: RollupGrain, bucket: string): CounterRow[] => {
    const { fromB, toB } = spanOf(grain, bucket);
    return mapRows(liveStmt, toCounter, fromB, toB);
  };

  /** Every bucket from `from` to `to` inclusive, in order. */
  const enumerate = (grain: RollupGrain, from: string, to: string): string[] => {
    const out: string[] = [];
    if (from > to) return out;
    if (grain === "day") {
      for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d);
    } else {
      const end = Date.parse(`${to}:00:00Z`);
      for (let t = Date.parse(`${from}:00:00Z`); t <= end; t += 3_600_000) out.push(hourBucket(t));
    }
    return out;
  };

  /** The newest bucket of the grain that has any hourly row, so a live read never walks past the data. */
  const newestBucket = (grain: RollupGrain): string | null => {
    const last = mapRow(db.prepare("SELECT MAX(bucket) AS b FROM analytics_hourly"), (r) => (r.b == null ? null : asText(r.b)));
    if (!last) return null;
    return grain === "hour" ? last : bucketDay(last, ROLLUP_TIME_ZONE);
  };

  /** Stored buckets are those before `through`; from `through` on is read live. */
  const split = (grain: RollupGrain, from: string, to: string): { storedTo: string | null; live: string[] } => {
    const through = getState(grain)?.through ?? null;
    const newest = newestBucket(grain);
    const liveTo = newest !== null && newest < to ? newest : to;
    const liveOf = (liveFrom: string): string[] => (newest === null ? [] : enumerate(grain, liveFrom, liveTo));
    if (through === null) return { storedTo: null, live: liveOf(from) };
    if (through > to) return { storedTo: to, live: [] };
    // `through` itself is live: it may have been open when it was computed.
    const liveFrom = through > from ? through : from;
    return {
      storedTo: through > from ? shiftBefore(grain, through) : null,
      live: liveOf(liveFrom),
    };
  };

  const shiftBefore = (grain: RollupGrain, bucket: string): string =>
    grain === "day" ? shiftDay(bucket, -1) : hourBucket(Date.parse(`${bucket}:00:00Z`) - 3_600_000);

  const isMaterialized = (grain: RollupGrain, bucket: string): boolean =>
    db
      .prepare("SELECT 1 FROM analytics_summary WHERE grain = ? AND bucket = ? AND metric = 'pageviews' LIMIT 1")
      .get(grain, bucket) !== undefined;

  /**
   * Recompute one bucket from the hourly rows: DELETE its rows, then INSERT ...
   * SELECT, in one transaction, so a re-run yields identical rows. A bucket with no
   * hourly rows is left exactly as it is (legacy day rows and days whose hours were
   * pruned have no other source); deleting a range on purpose goes through
   * `clearRollups`. Returns whether the bucket now has rows.
   */
  const materialize = (grain: RollupGrain, bucket: string): boolean =>
    transact(db, () => {
      const { fromB, toB } = spanOf(grain, bucket);
      if (hasHourly.get(fromB, toB) === undefined) return hasRollup.get(grain, bucket) !== undefined;
      delRollup.run(grain, bucket);
      delSummary.run(grain, bucket);
      insRollup.run(grain, bucket, fromB, toB);
      const counters = mapRows(readRollup, toCounter, grain, bucket);
      const summary = summarize(counters);
      for (const metric of SUMMARY_METRICS) {
        // `pageviews` is the marker that a bucket is materialized, so it is written even at 0.
        if (summary[metric] !== 0 || metric === "pageviews") insSummary.run(grain, bucket, metric, summary[metric]);
      }
      return true;
    });

  /** Merge persisted per-key counts with the live top-up. */
  const mergeKeys = (maps: Map<string, number>[]): Map<string, number> => {
    const out = new Map<string, number>();
    for (const m of maps) for (const [k, v] of m) out.set(k, (out.get(k) ?? 0) + v);
    return out;
  };

  /** Oldest and newest hour bucket in `analytics_hourly`, or null when empty. */
  const hourlyBounds = (): { first: string; last: string } | null =>
    mapRow(
      db.prepare("SELECT MIN(bucket) AS first, MAX(bucket) AS last FROM analytics_hourly WHERE dimension NOT LIKE ?"),
      (r) => (r.first == null ? null : { first: asText(r.first), last: asText(r.last) }),
      PAIR_DIMENSION_PREFIX,
    ) ?? null;

  return {
    materialize,
    isMaterialized,
    getRollupState: getState,

    /** Move `through` forward (never back) and stamp the run. */
    advanceRollupState(grain: RollupGrain, through: string, computedAt: string): void {
      db.prepare(
        `INSERT INTO analytics_rollup_state (grain, through, computed_at) VALUES (?, ?, ?)
         ON CONFLICT(grain) DO UPDATE SET through = max(through, excluded.through), computed_at = excluded.computed_at`,
      ).run(grain, through, computedAt);
    },

    hourlyBounds,

    /** Berlin day of the oldest hourly row, or null when there are none. */
    oldestHourlyDay(): string | null {
      const b = hourlyBounds();
      return b ? bucketDay(b.first, ROLLUP_TIME_ZONE) : null;
    },

    /**
     * Top keys of a dimension over `[from, to]` (buckets in the grain's format),
     * stored buckets plus the live top-up. `keys` narrows to exactly those keys.
     */
    rollupTop(
      grain: RollupGrain,
      dimension: string,
      from: string,
      to: string,
      limit = 20,
      keys?: readonly string[],
    ): RollupKeyRow[] {
      if (keys && keys.length === 0) return [];
      const { storedTo, live } = split(grain, from, to);
      const maps: Map<string, number>[] = [];
      if (storedTo !== null && storedTo >= from) {
        const clause = keys ? ` AND key IN (${inList(keys)})` : "";
        const rows = mapRows(
          db.prepare(
            `SELECT key, SUM(count) AS count FROM analytics_rollup
             WHERE grain = ? AND dimension = ? AND bucket BETWEEN ? AND ?${clause} GROUP BY key`,
          ),
          (r) => ({ key: asText(r.key), count: asNumber(r.count) }),
          grain,
          dimension,
          from,
          storedTo,
          ...(keys ?? []),
        );
        maps.push(new Map(rows.map((r) => [r.key, r.count])));
      }
      for (const bucket of live) {
        const m = new Map<string, number>();
        for (const c of liveCounters(grain, bucket)) {
          if (c.dimension === dimension && (!keys || keys.includes(c.key))) m.set(c.key, c.count);
        }
        maps.push(m);
      }
      return [...mergeKeys(maps)]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
        .slice(0, limit);
    },

    /** Per-bucket, per-key counts of a dimension over `[from, to]`. */
    rollupSeries(
      grain: RollupGrain,
      dimension: string,
      from: string,
      to: string,
      keys?: readonly string[],
    ): RollupSeriesRow[] {
      if (keys && keys.length === 0) return [];
      const { storedTo, live } = split(grain, from, to);
      const out: RollupSeriesRow[] = [];
      if (storedTo !== null && storedTo >= from) {
        const clause = keys ? ` AND key IN (${inList(keys)})` : "";
        out.push(
          ...mapRows(
            db.prepare(
              `SELECT bucket, key, count FROM analytics_rollup
               WHERE grain = ? AND dimension = ? AND bucket BETWEEN ? AND ?${clause} ORDER BY bucket ASC`,
            ),
            (r) => ({ bucket: asText(r.bucket), key: asText(r.key), count: asNumber(r.count) }),
            grain,
            dimension,
            from,
            storedTo,
            ...(keys ?? []),
          ),
        );
      }
      for (const bucket of live) {
        for (const c of liveCounters(grain, bucket)) {
          if (c.dimension === dimension && (!keys || keys.includes(c.key))) {
            out.push({ bucket, key: c.key, count: c.count });
          }
        }
      }
      return out;
    },

    /** One summary per bucket that has any data in `[from, to]`. */
    summaryByBucket(grain: RollupGrain, from: string, to: string): Map<string, SummaryValues> {
      const { storedTo, live } = split(grain, from, to);
      const out = new Map<string, SummaryValues>();
      if (storedTo !== null && storedTo >= from) {
        const rows = mapRows(
          db.prepare(
            `SELECT bucket, metric, value FROM analytics_summary
             WHERE grain = ? AND bucket BETWEEN ? AND ?`,
          ),
          (r) => ({ bucket: asText(r.bucket), metric: asText(r.metric), value: asNumber(r.value) }),
          grain,
          from,
          storedTo,
        );
        for (const r of rows) {
          const s = out.get(r.bucket) ?? emptySummary();
          if ((SUMMARY_METRICS as readonly string[]).includes(r.metric)) s[r.metric as SummaryMetric] = r.value;
          out.set(r.bucket, s);
        }
      }
      for (const bucket of live) {
        const counters = liveCounters(grain, bucket);
        if (counters.length > 0) out.set(bucket, summarize(counters));
      }
      return out;
    },

    /**
     * The first hour that recorded a `visit` event, as a UTC hour bucket. Looks in
     * the hourly rows and, once those are pruned, in the day rollups.
     */
    confirmationSince(): string | null {
      const hourly = mapRow(
        db.prepare("SELECT MIN(bucket) AS b FROM analytics_hourly WHERE dimension = 'visit'"),
        (r) => (r.b == null ? null : asText(r.b)),
      );
      const day = mapRow(
        db.prepare("SELECT MIN(bucket) AS b FROM analytics_rollup WHERE grain = 'day' AND dimension = 'visit'"),
        (r) => (r.b == null ? null : asText(r.b)),
      );
      if (!day) return hourly ?? null;
      // The hourly row is the precise answer while it is still there for that day.
      if (hourly && bucketDay(hourly, ROLLUP_TIME_ZONE) === day) return hourly;
      const dayHour = hourBucket(localDayStartMs(day, ROLLUP_TIME_ZONE));
      return hourly && hourly < dayHour ? hourly : dayHour;
    },

    /**
     * Delete stored rollups for an inclusive UTC hour range, ahead of re-deriving
     * them after rows were cleared. Day buckets that overlap the range go whole.
     */
    clearRollups(fromB: string, toB: string): void {
      transact(db, () => {
        for (const table of ["analytics_rollup", "analytics_summary"] as const) {
          db.prepare(`DELETE FROM ${table} WHERE grain = 'hour' AND bucket BETWEEN ? AND ?`).run(fromB, toB);
          db.prepare(`DELETE FROM ${table} WHERE grain = 'day' AND bucket BETWEEN ? AND ?`).run(
            bucketDay(fromB, ROLLUP_TIME_ZONE),
            bucketDay(toB, ROLLUP_TIME_ZONE),
          );
        }
      });
    },

    /** Delete every rollup, summary and state row ("clear everything"). */
    clearAllRollups(): void {
      transact(db, () => {
        db.exec("DELETE FROM analytics_rollup; DELETE FROM analytics_summary; DELETE FROM analytics_rollup_state;");
      });
    },

    /** Drop stored rows of the given dimensions and the summary figures they feed. */
    clearRollupDimensions(dimensions: readonly string[]): void {
      if (dimensions.length === 0) return;
      transact(db, () => {
        db.prepare(`DELETE FROM analytics_rollup WHERE dimension IN (${inList(dimensions)})`).run(...dimensions);
        const metrics = dimensions.flatMap(summaryMetricsOf);
        if (metrics.length > 0) {
          db.prepare(`DELETE FROM analytics_summary WHERE metric IN (${inList(metrics)})`).run(...metrics);
        }
      });
    },

    /**
     * Storage retention: an hourly row is dropped only once its Berlin day is
     * stored in the day grain. Whole Berlin days older than `retainDays` are
     * materialized first, verified, then folded into the legacy UTC `analytics_daily`
     * table (kept for the older tooling) and deleted from the hourly table. The
     * Berlin day containing the cutoff is kept whole until it ends, so a day is
     * never half-pruned. Old hour rollups go too. Idempotent.
     */
    rollupAndPrune(retainDays: number): { rolledUp: number; pruned: number } {
      const now = Date.now();
      const cutoff = hourBucket(now - retainDays * MS_PER_DAY);
      const keepFrom = hourBucket(localDayStartMs(bucketDay(cutoff, ROLLUP_TIME_ZONE), ROLLUP_TIME_ZONE));
      return transact(db, () => {
        let rolledUp = 0;
        let pruned = 0;
        const days = [
          ...new Set(
            mapRows(
              db.prepare("SELECT DISTINCT bucket FROM analytics_hourly WHERE bucket < ?"),
              (r) => bucketDay(asText(r.bucket), ROLLUP_TIME_ZONE),
              keepFrom,
            ),
          ),
        ].sort();
        for (const day of days) {
          materialize("day", day);
          if (!isMaterialized("day", day)) continue;
          const { fromB, toB } = dayHourSpan(day, ROLLUP_TIME_ZONE);
          rolledUp += Number(
            db
              .prepare(
                `INSERT INTO analytics_daily (day, dimension, key, count)
                 SELECT substr(bucket, 1, 10) AS day, dimension, key, SUM(count)
                 FROM analytics_hourly WHERE bucket BETWEEN ? AND ?
                 GROUP BY day, dimension, key
                 ON CONFLICT(day, dimension, key) DO UPDATE SET count = count + excluded.count`,
              )
              .run(fromB, toB).changes,
          );
          pruned += Number(db.prepare("DELETE FROM analytics_hourly WHERE bucket BETWEEN ? AND ?").run(fromB, toB).changes);
        }
        const hourKeep = hourBucket(now - HOUR_ROLLUP_RETAIN_DAYS * MS_PER_DAY);
        db.prepare("DELETE FROM analytics_rollup WHERE grain = 'hour' AND bucket < ?").run(hourKeep);
        db.prepare("DELETE FROM analytics_summary WHERE grain = 'hour' AND bucket < ?").run(hourKeep);
        return { rolledUp, pruned };
      });
    },
  };
}

export type RollupRepo = ReturnType<typeof rollupRepo>;
