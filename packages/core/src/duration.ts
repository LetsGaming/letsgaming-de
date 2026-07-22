/**
 * Durations, as people read them.
 *
 * Everything upstream counts in whole minutes — sessions, plays, heatmap buckets —
 * because that's the resolution the presence sampler can honestly claim. But
 * "265min" is a number you have to do arithmetic on to understand, so the display
 * layer splits it into hours and minutes.
 *
 * Pure and unit-free: it returns the parts, and the caller supplies the labels
 * (which are localized) and the markup (the unit is rendered small). That keeps
 * this usable from the server, the CMS, and a Vue template alike.
 */

export interface DurationParts {
  hours: number;
  /** Remaining minutes after the whole hours, 0–59. */
  minutes: number;
}

/**
 * Split a minute count into whole hours plus the remainder.
 *
 * Negative and fractional inputs are coerced rather than rejected: these numbers
 * come from `SUM()`s over session rows, and a rounding artefact should render as a
 * sensible duration, not crash a page.
 */
export function splitDuration(totalMinutes: number): DurationParts {
  const total = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0;
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
