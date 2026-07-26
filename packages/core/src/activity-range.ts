/**
 * The window the accumulated-activity modules (Listening, Played) cover.
 *
 * This used to be one constant — `PLAYTIME_WINDOW_DAYS = 14` — read straight out
 * of the view builder, which meant the fortnight was a property of the *server*
 * rather than a question the viewer could ask. The range is now a request
 * parameter: the modules ship their window alongside their data, and a viewer can
 * re-ask for a longer one the same way they can re-ask for their own timezone.
 *
 * A closed set rather than a free integer, for two reasons. The label is a
 * translated message key, not a formatted number, so "3 months" reads as months in
 * both locales instead of "90 days"; and a bounded set is a bounded query — an
 * open `?days=` is an invitation to ask for 100000 and make the server aggregate
 * every session it has ever recorded.
 */

import type { MessageKey } from "./ui-messages.js";

/** Every selectable window, shortest first. The order the picker renders in. */
export const ACTIVITY_RANGES = [14, 30, 90, 180, 365] as const;

export type ActivityRange = (typeof ACTIVITY_RANGES)[number];

/**
 * The window a module opens in when nobody has chosen one.
 *
 * A fortnight: long enough that a quiet week doesn't empty the page, short enough
 * that "what have I been playing" means recently. The CMS can change it per module
 * (see `ListDisplaySettings.defaultRange`); this is the fallback when it hasn't.
 */
export const DEFAULT_ACTIVITY_RANGE: ActivityRange = 14;

/**
 * The widest window a viewer can ask for.
 *
 * For the background work that has to be ready *before* anyone asks — the RAWG
 * metadata sync, which fetches cover art by game name. It warmed the cache for the
 * fortnight, because the fortnight was the only window there was; against a
 * year-long range that leaves every game older than two weeks without a cover.
 * Derived, so widening the set can't leave the sync behind.
 */
export const MAX_ACTIVITY_RANGE: ActivityRange = ACTIVITY_RANGES.reduce<ActivityRange>(
  (widest, days) => (days > widest ? days : widest),
  ACTIVITY_RANGES[0],
);

export function isActivityRange(value: unknown): value is ActivityRange {
  return typeof value === "number" && (ACTIVITY_RANGES as readonly number[]).includes(value);
}

/**
 * Narrow an untrusted range (a query string, a stored setting) to a real one.
 *
 * Accepts a numeric string as well as a number, because the one place this is most
 * needed is `?days=90`, where the value arrives as text. Anything else — an
 * unlisted number, a word, a missing value — takes the fallback rather than
 * throwing: a bad range is a reason to show the default window, not a 400.
 */
export function sanitizeActivityRange(
  value: unknown,
  fallback: ActivityRange = DEFAULT_ACTIVITY_RANGE,
): ActivityRange {
  const n = typeof value === "string" ? Number(value) : value;
  return isActivityRange(n) ? n : fallback;
}

/**
 * The two labels each range carries.
 *
 * `short` is the picker segment ("3m") — mono, sits in a card header beside the
 * timezone toggle. `long` is the card's own note ("last 3 months"), which is the
 * string that has to say *what window you are reading* when the picker is offscreen.
 *
 * Both are message keys rather than text: the German for "last 3 months" is not
 * the German for "last" plus a number, so a template with a `{n}` hole would only
 * ever be right in English.
 */
export const ACTIVITY_RANGE_LABELS: Record<ActivityRange, { short: MessageKey; long: MessageKey }> = {
  14: { short: "range14", long: "lastDays14" },
  30: { short: "range30", long: "lastDays30" },
  90: { short: "range90", long: "lastDays90" },
  180: { short: "range180", long: "lastDays180" },
  365: { short: "range365", long: "lastDays365" },
};

/**
 * How the day strip should be laid out for a window.
 *
 * A strip is one row of day cells, which stops working long before a year: at the
 * 8px floor, 365 cells is ~2900px and the grid just scrolls sideways. Past 90 days
 * it wraps to seven rows — still one cell per day, so every cell stays clickable
 * and the day drill-in survives at every range, but the columns are weeks and it
 * fits the card.
 *
 * Not weekday-aligned, deliberately: aligning would mean extending the window back
 * to the nearest Monday, and a strip that quietly covers six more days than the
 * totals beside it is worse than one that reads as a wrapped timeline. The axis
 * labels the real first day either way.
 */
export function stripLayout(days: number): { rows: number; cellHeight: number } {
  return days > 90 ? { rows: 7, cellHeight: 13 } : { rows: 1, cellHeight: 30 };
}
