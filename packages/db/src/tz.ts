/**
 * Timezone-aware bucketing of UTC session spans into local weekday / hour / day.
 *
 * The observed-activity aggregations (the day strips, the "when I play" heatmap,
 * the day drill-in) all group by a wall-clock unit, and *which* wall clock is a
 * choice: the owner's zone by default, a visitor's zone on request. SQLite's
 * `'localtime'` can't express that — it reads the one process `TZ`, which is
 * global and can't vary per request. So the grouping is done here in JS from the
 * raw UTC rows, with the zone as a parameter, using `Intl` (the same system tz
 * database) so each instant is bucketed by *its own* offset — a July session at
 * +02:00 and a January one at +01:00 both land on the right wall-clock hour,
 * exact across DST.
 *
 * `Intl.DateTimeFormat` is the slow part to construct, so formatters are cached
 * per zone; a whole-history bucketing then costs one `formatToParts` per session
 * hour-slot, which is nothing at personal-site row counts.
 */

const HOUR_MS = 3_600_000;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

// 0 = Sunday .. 6 = Saturday, matching what the heatmap view expects (it rotates
// to Mon-first itself). Kept identical to SQLite's `%w` so nothing downstream had
// to change when this moved off `'localtime'`.
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The wall-clock weekday (0=Sun), hour (0–23) and day (`YYYY-MM-DD`) of a UTC
 *  instant in `timeZone`. */
export function zonedParts(epochMs: number, timeZone: string): { weekday: number; hour: number; day: string } {
  const parts = formatter(timeZone).formatToParts(epochMs);
  const get = (t: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some engines emit 24 for midnight even under h23
  return {
    weekday: WEEKDAY[get("weekday")] ?? 0,
    hour,
    day: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** The `YYYY-MM-DD` local day of an ISO timestamp in `timeZone`. */
export function zonedDay(iso: string, timeZone: string): string {
  return zonedParts(new Date(iso).getTime(), timeZone).day;
}

/**
 * Walk a session `[startIso, endIso]` hour by hour, calling `add` with each slot's
 * local weekday/hour and the milliseconds of the session that fall in it. Spans
 * that cross an hour (or a midnight, or a DST change) are split across the slots
 * they touch — this is what lets the heatmap show every hour a long session
 * covered, not just the one it began in.
 */
export function eachHourSlot(
  startIso: string,
  endIso: string,
  timeZone: string,
  add: (weekday: number, hour: number, ms: number) => void,
): void {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!(end > start)) return;
  // Start of the UTC hour containing `start`. For whole-hour-offset zones (which
  // is nearly all of them) a UTC hour maps cleanly onto one local hour, so a
  // slot's minutes belong entirely to the local hour of its start.
  for (let slot = Math.floor(start / HOUR_MS) * HOUR_MS; slot < end; slot += HOUR_MS) {
    const overlap = Math.min(end, slot + HOUR_MS) - Math.max(start, slot);
    const { weekday, hour } = zonedParts(slot, timeZone);
    add(weekday, hour, overlap);
  }
}

/**
 * The zone `analytics_rollup` day buckets are expressed in. A day rollup is a
 * wall-clock fact, so it can only serve readers in the zone it was cut in.
 */
export const ROLLUP_TIME_ZONE = "Europe/Berlin";

/** A UTC hour bucket label, `YYYY-MM-DDTHH`. */
export function hourBucket(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 13);
}

/** A calendar-day label shifted by a whole number of days (may be negative). */
export function shiftDay(day: string, deltaDays: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + deltaDays * 24 * HOUR_MS).toISOString().slice(0, 10);
}

/**
 * How far a zone's wall clock runs ahead of UTC at a given instant, in ms.
 *
 * `zonedParts` resolves to the hour, so the instant is floored to the hour before
 * comparing; otherwise the minutes would show up as a bogus sub-hour offset.
 */
function zoneOffsetMs(atMs: number, timeZone: string): number {
  const p = zonedParts(atMs, timeZone);
  const asIfUtc = Date.parse(`${p.day}T${String(p.hour).padStart(2, "0")}:00:00Z`);
  return asIfUtc - Math.floor(atMs / HOUR_MS) * HOUR_MS;
}

/**
 * The UTC instant at which a local calendar day begins.
 *
 * Two passes: the offset at the naive guess may not be the one that applies at the
 * answer, because on a DST changeover the clock moves between them.
 */
export function localDayStartMs(day: string, timeZone: string): number {
  const wall = Date.parse(`${day}T00:00:00Z`);
  const first = wall - zoneOffsetMs(wall, timeZone);
  return wall - zoneOffsetMs(first, timeZone);
}

/**
 * The inclusive UTC hour-bucket span of one local day. A day is 23, 24 or 25
 * hours long across a DST change, which is why this can't be `T00`..`T23`.
 */
export function dayHourSpan(day: string, timeZone: string): { fromB: string; toB: string; hours: number } {
  const start = localDayStartMs(day, timeZone);
  const next = localDayStartMs(shiftDay(day, 1), timeZone);
  return { fromB: hourBucket(start), toB: hourBucket(next - HOUR_MS), hours: Math.round((next - start) / HOUR_MS) };
}

/** The local day an hour bucket (`YYYY-MM-DDTHH`, UTC) falls on. */
export function bucketDay(bucket: string, timeZone: string): string {
  return zonedParts(Date.parse(`${bucket}:00:00Z`), timeZone).day;
}
