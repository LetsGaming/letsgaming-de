/**
 * Pure formatting helpers used by the resolver. Kept dependency-free and tested
 * so the read API's output stays deterministic.
 *
 * Note on emphasis: prose fields keep their `**bold**` markers verbatim through
 * resolution, turning them into markup is a frontend concern (and the only safe
 * place to do it, since the API never emits raw HTML).
 */

import type { Locale } from "./i18n.js";

/** 428 -> "428", 2100 -> "2.1k" ("2,1k" in German), 1_200_000 -> "1.2M". */
export function compactNumber(n: number, locale: Locale = "en"): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${trim(k, locale)}k`;
  }
  const m = n / 1_000_000;
  return `${trim(m, locale)}M`;
}

function trim(x: number, locale: Locale): string {
  // One decimal, but drop a trailing ".0"; the separator follows the locale.
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(x);
}

/** Unit labels for `relativeTime`, per locale. German reads "vor 2 Std", so it carries a space. */
const AGE_UNITS: Record<Locale, { m: string; h: string; d: string; w: string; mo: string; y: string }> = {
  en: { m: "m", h: "h", d: "d", w: "w", mo: "mo", y: "y" },
  de: { m: " Min", h: " Std", d: " T", w: " Wo", mo: " Mon", y: " J" },
}

/**
 * Short relative time from an ISO timestamp: "1m", "2d", "6d", "1w", "3mo", "2y".
 *
 * Floors at "1m", not "now": every consumer composes this into an "{age} ago"
 * template (`freshFresh`/`ago` in ui-messages.ts), "synced now ago" is broken
 * grammar, and this function stays a bare duration unit (no locale, no phrase)
 * per its own dependency-free contract, so the fix belongs here, not in every
 * template that would otherwise need to special-case the sub-minute case.
 */
export function relativeTime(iso: string, now: Date = new Date(), locale: Locale = "en"): string {
  const u = AGE_UNITS[locale] ?? AGE_UNITS.en;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days < 1) {
    if (hours >= 1) return `${hours}${u.h}`;
    return `${Math.max(1, mins)}${u.m}`;
  }
  if (days < 7) return `${days}${u.d}`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks}${u.w}`;
  const months = Math.floor(days / 30);
  if (days < 365) return `${months}${u.mo}`;
  const years = Math.floor(days / 365);
  return `${years}${u.y}`;
}

/**
 * The heatmap's five shades, quietest first.
 *
 * Exported because the legend renders the same range and used to spell it as a
 * literal `[0, 1, 2, 3, 4]` beside a bucketer that produced it, two copies of
 * one range, and a sixth shade would have shown up in the map and not the key.
 * Each level `n` also names a `--heat-n` token; that binding is by convention,
 * which `lint:tokens` is what catches.
 */
export const HEAT_LEVELS = [0, 1, 2, 3, 4] as const;
export type HeatLevel = (typeof HEAT_LEVELS)[number];

/**
 * Ratio of the window's max at which each level starts, brightest first. Relative
 * rather than absolute so the graph reads the same for 3 commits a day and 30, 
 * it shows shape, not volume; the "N this year" caption carries volume.
 */
const HEAT_THRESHOLDS: readonly { atLeast: number; level: HeatLevel }[] = [
  { atLeast: 0.8, level: 4 },
  { atLeast: 0.6, level: 3 },
  { atLeast: 0.35, level: 2 },
];

/**
 * Bucket per-day contribution intensities into {@link HEAT_LEVELS}. A zero day is
 * always level 0, and a day with any activity is never level 0, "did he commit
 * at all" is the question the grid answers, so it can't round down to nothing.
 *
 * `dates`/`counts` ride along, parallel to `levels`, so a caller can build a
 * per-cell tooltip ("3 commits on Mon 15 Sep") without re-deriving which
 * calendar day each bucketed cell was, the shading is a lossy summary, the
 * raw count and date underneath it are not.
 */
export function bucketHeat(
  contributions: readonly { date: string; count: number }[],
): { levels: number[]; dates: string[]; counts: number[]; total: number } {
  const counts = contributions.map((d) => d.count);
  const dates = contributions.map((d) => d.date);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = counts.reduce((a, b) => Math.max(a, b), 0);
  if (max === 0) return { levels: counts.map(() => 0), dates, counts, total };
  const levels = counts.map((v) => {
    if (v <= 0) return 0;
    const ratio = v / max;
    return HEAT_THRESHOLDS.find((t) => ratio > t.atLeast)?.level ?? 1;
  });
  return { levels, dates, counts, total };
}
