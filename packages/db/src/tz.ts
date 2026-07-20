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
