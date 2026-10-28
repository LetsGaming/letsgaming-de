/**
 * The rollup jobs: keep `analytics_rollup` and `analytics_summary` current from
 * `analytics_hourly`. Every job recomputes whole buckets (DELETE, then INSERT ...
 * SELECT in one transaction), so any of them can run twice, overlap a range, or be
 * re-run by hand without changing the result.
 */

import {
  ROLLUP_TIME_ZONE,
  bucketDay,
  hourBucket,
  shiftDay,
  type RollupGrain,
  type Store,
} from "@lg/db";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Matches the retention of hour rollups in the store. */
const HOUR_BACKFILL_DAYS = 14;
/** The hourly job recomputes the current hour and the two before it. */
const HOURLY_LOOKBACK_HOURS = 2;

function buckets(grain: RollupGrain, from: string, to: string): string[] {
  const out: string[] = [];
  if (grain === "day") {
    for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d);
  } else {
    const end = Date.parse(`${to}:00:00Z`);
    for (let t = Date.parse(`${from}:00:00Z`); t <= end; t += HOUR_MS) out.push(hourBucket(t));
  }
  return out;
}

const currentBucket = (grain: RollupGrain, now: Date): string =>
  grain === "hour" ? hourBucket(now.getTime()) : bucketDay(hourBucket(now.getTime()), ROLLUP_TIME_ZONE);

export interface RollupRangeOptions {
  /** The range starts at the very beginning of the data, so `through` may be set. */
  initial?: boolean;
  now?: Date;
}

/**
 * Recompute the buckets of one grain from `from` to `to` inclusive (hour buckets
 * `YYYY-MM-DDTHH` UTC, day buckets `YYYY-MM-DD` Berlin). Returns how many buckets
 * were visited.
 *
 * `through` only advances when the range joins what is already stored (it starts at
 * or before the current `through`, or it is the initial full pass). A backfill of a
 * middle slice therefore can't make readers trust buckets that were never computed.
 */
export function rollupRange(
  store: Store,
  grain: RollupGrain,
  from: string,
  to: string,
  options: RollupRangeOptions = {},
): number {
  const now = options.now ?? new Date();
  const list = buckets(grain, from, to);
  for (const bucket of list) store.analytics.materialize(grain, bucket);
  if (list.length === 0) return 0;

  const state = store.analytics.getRollupState(grain);
  const joins = state ? from <= state.through : options.initial === true;
  if (joins) {
    const newest = list[list.length - 1]!;
    const cap = currentBucket(grain, now);
    store.analytics.advanceRollupState(grain, newest < cap ? newest : cap, now.toISOString());
  }
  return list.length;
}

/** Recompute the open and recent hour buckets. Falls back to a full catch-up on first run. */
export function runHourlyRollup(store: Store, now = new Date()): void {
  if (!store.analytics.getRollupState("hour")) return void catchUp(store, now);
  const to = hourBucket(now.getTime());
  rollupRange(store, "hour", hourBucket(now.getTime() - HOURLY_LOOKBACK_HOURS * HOUR_MS), to, { now });
}

/** Recompute the last two Berlin days, and the last 48 hours of hour buckets with them. */
export function runDailyRollup(store: Store, now = new Date()): void {
  const today = currentBucket("day", now);
  rollupRange(store, "day", shiftDay(today, -1), today, { now });
  rollupRange(store, "hour", hourBucket(now.getTime() - 48 * HOUR_MS), hourBucket(now.getTime()), { now });
}

/**
 * Bring both grains up to date from wherever they stopped: boot, and the full
 * rebuild. With no state yet, starts at the oldest hourly row.
 */
export function catchUp(store: Store, now = new Date()): { hour: number; day: number } {
  const bounds = store.analytics.hourlyBounds();
  const result = { hour: 0, day: 0 };

  const hourState = store.analytics.getRollupState("hour");
  const hourFloor = hourBucket(now.getTime() - HOUR_BACKFILL_DAYS * DAY_MS);
  const hourStart = hourState
    ? hourBucket(Date.parse(`${hourState.through}:00:00Z`) - HOURLY_LOOKBACK_HOURS * HOUR_MS)
    : bounds
      ? bounds.first > hourFloor
        ? bounds.first
        : hourFloor
      : null;
  if (hourStart) {
    result.hour = rollupRange(store, "hour", hourStart, currentBucket("hour", now), { initial: !hourState, now });
  }

  const dayState = store.analytics.getRollupState("day");
  const dayStart = dayState ? shiftDay(dayState.through, -1) : bounds ? bucketDay(bounds.first, ROLLUP_TIME_ZONE) : null;
  if (dayStart) {
    result.day = rollupRange(store, "day", dayStart, currentBucket("day", now), { initial: !dayState, now });
  }
  return result;
}

/**
 * Recompute every day from `from` to `to` (and the hour buckets they cover that are
 * still retained). The manual backfill behind `pnpm analytics:rollup --from --to`.
 */
export function rollupDays(store: Store, from: string, to: string, now = new Date()): { hour: number; day: number } {
  const day = rollupRange(store, "day", from, to, { now });
  const hourFloor = hourBucket(now.getTime() - HOUR_BACKFILL_DAYS * DAY_MS);
  const hourFrom = hourBucket(Date.parse(`${from}T00:00:00Z`) - DAY_MS);
  const hourTo = hourBucket(Date.parse(`${to}T00:00:00Z`) + 2 * DAY_MS);
  const cappedTo = hourTo < hourBucket(now.getTime()) ? hourTo : hourBucket(now.getTime());
  const start = hourFrom > hourFloor ? hourFrom : hourFloor;
  const hour = start <= cappedTo ? rollupRange(store, "hour", start, cappedTo, { now }) : 0;
  return { hour, day };
}

/** Recompute every day that has hourly rows, then bring the state up to date. */
export function rollupAll(store: Store, now = new Date()): { hour: number; day: number } {
  const bounds = store.analytics.hourlyBounds();
  if (!bounds) return { hour: 0, day: 0 };
  const swept = rollupDays(store, bucketDay(bounds.first, ROLLUP_TIME_ZONE), currentBucket("day", now), now);
  const caught = catchUp(store, now);
  return { hour: swept.hour + caught.hour, day: swept.day + caught.day };
}
