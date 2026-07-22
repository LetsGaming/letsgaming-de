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
  /** Whether to render the hours at all — false under an hour. */
  showHours: boolean;
  /** False only when whole hours would be followed by a redundant `0min`. */
  showMinutes: boolean;
}

/**
 * Split a minute count into whole hours plus the remainder, and decide which
 * halves are worth rendering.
 *
 * The two `show*` flags are part of the split rather than the caller's business
 * because they *are* the display rule ("2h", not "2h 0min"; "45min", not "0h
 * 45min"), and it has to hold identically wherever a duration appears. It used to
 * live in `Duration.vue` alone, so anything that needed a duration as plain text —
 * a tooltip, a hover title — reimplemented it and drifted: the playtime heatmap
 * said `1.3h` in a cell title while the row underneath said `1h 18min`.
 *
 * Negative and fractional inputs are coerced rather than rejected: these numbers
 * come from `SUM()`s over session rows, and a rounding artefact should render as a
 * sensible duration, not crash a page.
 */
export function splitDuration(totalMinutes: number): DurationParts {
  const total = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return { hours, minutes, showHours: hours > 0, showMinutes: minutes > 0 || hours === 0 };
}

/**
 * The same duration as a plain string, for the places markup can't go — a `title`
 * attribute, an `aria-label`, a chart tooltip.
 *
 * Unit labels stay the caller's job (this file is deliberately locale-free); pass
 * the localized short forms. On the web that's `useT().duration()`, which binds
 * them to the rendered locale so text and `<Duration>` always agree.
 */
export function formatDuration(totalMinutes: number, units: { hours: string; minutes: string }): string {
  const parts = splitDuration(totalMinutes);
  const out: string[] = [];
  if (parts.showHours) out.push(`${parts.hours}${units.hours}`);
  if (parts.showMinutes) out.push(`${parts.minutes}${units.minutes}`);
  return out.join(" ");
}
