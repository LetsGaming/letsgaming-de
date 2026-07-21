/**
 * The Wrapped module — a periodic retrospective of listening and playing, in the
 * spirit of Spotify Wrapped, built from the activity already recorded (music_plays
 * and observed game sessions).
 *
 * What's novel here is *when* it shows: not always, but on a recurring schedule the
 * owner sets — "every N months, for M weeks, starting from date X". This file owns
 * that schedule as a pure function (`wrappedWindow`), so both the view builder (to
 * decide whether to aggregate) and the resolver (to decide whether to emit) agree,
 * and it's unit-testable without a clock or a database.
 *
 * The visibility is enforced server-side, like every other toggle: outside a window
 * the module is *absent from the resolved view*, never sent-then-hidden.
 */

/** CMS-owned config for the recurring Wrapped module. */
export interface WrappedSettings {
  /** Whether the module ever appears. Off by default — opt-in. */
  enabled: boolean;
  /** Cycle length in months: a new window opens this often. */
  everyMonths: number;
  /** How long each window stays open, in weeks. */
  forWeeks: number;
  /** Anchor date `YYYY-MM-DD`: the first window opens on this day (UTC). */
  fromDate: string;
  /** How many rows each top list (songs, artists, games) shows. */
  topCount: number;
}

/** Bounds for the numeric settings, in one place so schema and sanitizer agree. */
export const WRAPPED_BOUNDS = {
  everyMonths: { min: 1, max: 24 },
  forWeeks: { min: 1, max: 12 },
  topCount: { min: 3, max: 20 },
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultWrappedSettings(): WrappedSettings {
  return { enabled: false, everyMonths: 3, forWeeks: 2, fromDate: "2026-01-01", topCount: 5 };
}

const clampInt = (value: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(hi, Math.max(lo, n));
};

/** Coerce untrusted input to a valid settings object — every field falls back to
 *  its default rather than trusting the shape, and an invalid date is dropped. */
export function sanitizeWrappedSettings(input: unknown): WrappedSettings {
  const obj = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const d = defaultWrappedSettings();
  const from = typeof obj.fromDate === "string" && DATE_RE.test(obj.fromDate) ? obj.fromDate : d.fromDate;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : d.enabled,
    everyMonths: clampInt(obj.everyMonths, WRAPPED_BOUNDS.everyMonths.min, WRAPPED_BOUNDS.everyMonths.max, d.everyMonths),
    forWeeks: clampInt(obj.forWeeks, WRAPPED_BOUNDS.forWeeks.min, WRAPPED_BOUNDS.forWeeks.max, d.forWeeks),
    fromDate: from,
    topCount: clampInt(obj.topCount, WRAPPED_BOUNDS.topCount.min, WRAPPED_BOUNDS.topCount.max, d.topCount),
  };
}

/** Add `n` months to a UTC date, clamping the day to the target month's length so
 *  Jan 31 + 1 month is Feb 28/29, not an overflow into March. */
function addMonths(date: Date, n: number): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + n;
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

const addWeeks = (date: Date, n: number): Date => new Date(date.getTime() + n * 7 * 24 * 3_600_000);
const isoDate = (d: Date): string => d.toISOString();

/** The active Wrapped window covering `now`, and the period it summarizes. */
export interface WrappedWindow {
  /** Start of the current display window — a cycle boundary. */
  windowStart: string;
  /** End of the display window (`windowStart` + `forWeeks`). */
  windowEnd: string;
  /** Start of the summarized period (`windowStart` − `everyMonths`). */
  periodStart: string;
  /** End of the summarized period (= `windowStart`); the cycle that just closed. */
  periodEnd: string;
}

/**
 * The window covering `now`, or `null` when the module shouldn't show.
 *
 * Cycle boundaries fall on `fromDate`, then every `everyMonths` months. Each opens a
 * display window of `forWeeks`. If `now` sits inside one, the module shows and
 * summarizes the cycle that just closed — `[boundary − everyMonths, boundary]` — so
 * the numbers are a fixed retrospective, stable for the whole window rather than a
 * rolling count. Disabled, an unparseable date, or a `now` before `fromDate` all
 * return `null`.
 */
export function wrappedWindow(settings: WrappedSettings, now: Date): WrappedWindow | null {
  if (!settings.enabled || !DATE_RE.test(settings.fromDate)) return null;
  const from = new Date(`${settings.fromDate}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || now.getTime() < from.getTime()) return null;

  // Whole months elapsed from `from` to `now` (a partial month doesn't count), then
  // the most recent boundary is that many months back, rounded down to a cycle.
  let months = (now.getUTCFullYear() - from.getUTCFullYear()) * 12 + (now.getUTCMonth() - from.getUTCMonth());
  if (now.getUTCDate() < from.getUTCDate()) months -= 1;
  const cycles = Math.floor(months / settings.everyMonths);
  const boundary = addMonths(from, cycles * settings.everyMonths);
  const windowEnd = addWeeks(boundary, settings.forWeeks);

  if (now.getTime() < boundary.getTime() || now.getTime() >= windowEnd.getTime()) return null;

  return {
    windowStart: isoDate(boundary),
    windowEnd: isoDate(windowEnd),
    periodStart: isoDate(addMonths(boundary, -settings.everyMonths)),
    periodEnd: isoDate(boundary),
  };
}
