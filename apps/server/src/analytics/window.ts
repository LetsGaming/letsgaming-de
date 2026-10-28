/**
 * Analytics windows: the range being shown and the equal-length range right before
 * it, which every delta compares against.
 *
 * Both are whole buckets, same count, with the previous one ending exactly where
 * the current one starts. The old code floored the current day window to local
 * midnight but ended the previous window an hour before `windowStart`, so the
 * two overlapped by a day or more and the column count of the same "7d" preset
 * changed with the time of day it was opened.
 */

import { dayHourSpan, hourBucket, shiftDay, zonedParts } from "@lg/db";

const HOUR_MS = 3_600_000;

/** One window of whole buckets. */
export interface Win {
  unit: "hour" | "day";
  /** First and last bucket of the axis: UTC hours, or local `YYYY-MM-DD` days. */
  from: string;
  to: string;
  /** The inclusive UTC hour span the window covers (a local day is 23 to 25 hours). */
  fromB: string;
  toB: string;
}

export interface Windows {
  current: Win;
  previous: Win;
}

export interface WindowSpec {
  now: Date;
  /** Rolling length in hours. Ignored for a custom range. */
  hours: number;
  unit: "hour" | "day";
  timeZone: string;
  custom?: { from: string; to: string } | null;
}

function hourWin(from: string, to: string): Win {
  return { unit: "hour", from, to, fromB: from, toB: to };
}

function dayWin(from: string, to: string, timeZone: string): Win {
  return {
    unit: "day",
    from,
    to,
    fromB: dayHourSpan(from, timeZone).fromB,
    toB: dayHourSpan(to, timeZone).toB,
  };
}

/** The window for `spec` and the one of equal length that ends just before it. */
export function buildWindows(spec: WindowSpec): Windows {
  if (spec.unit === "hour") {
    const to = hourBucket(spec.now.getTime());
    const from = hourBucket(spec.now.getTime() - (spec.hours - 1) * HOUR_MS);
    const prevTo = hourBucket(Date.parse(`${from}:00:00Z`) - HOUR_MS);
    const prevFrom = hourBucket(Date.parse(`${prevTo}:00:00Z`) - (spec.hours - 1) * HOUR_MS);
    return { current: hourWin(from, to), previous: hourWin(prevFrom, prevTo) };
  }

  const days = spec.custom
    ? Math.round((Date.parse(`${spec.custom.to}T00:00:00Z`) - Date.parse(`${spec.custom.from}T00:00:00Z`)) / (24 * HOUR_MS)) + 1
    : Math.max(1, Math.ceil(spec.hours / 24));
  const to = spec.custom?.to ?? zonedParts(spec.now.getTime(), spec.timeZone).day;
  const from = spec.custom?.from ?? shiftDay(to, -(days - 1));
  const prevTo = shiftDay(from, -1);
  const prevFrom = shiftDay(prevTo, -(days - 1));
  return { current: dayWin(from, to, spec.timeZone), previous: dayWin(prevFrom, prevTo, spec.timeZone) };
}

/** A single bucket (`at`) as a window: an hour, or one local day. */
export function bucketWindow(at: string, timeZone: string): Win {
  return at.length === 13 ? hourWin(at, at) : dayWin(at, at, timeZone);
}
