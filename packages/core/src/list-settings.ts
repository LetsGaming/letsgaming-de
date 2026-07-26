import { sanitizeActivityRange, type ActivityRange } from "./activity-range.js";

/**
 * CMS-owned display config shared by the activity modules.
 *
 * Three knobs, identical in shape for Listening and Playtime (and anything else with
 * a top-N list over a window): `initialCount` rows before "show more", `maxCount` —
 * the hard cap the list never exceeds — and `defaultRange`, the window the module
 * opens in. Kept in one place so the coherence rule (initial ≤ max) and the bounds
 * live once; each module supplies its own defaults and stores its own value, so their
 * limits and their opening window can differ.
 */
export interface ListDisplaySettings {
  /** Rows shown before "show more". */
  initialCount: number;
  /** Hard cap on rows the list ever shows. */
  maxCount: number;
  /**
   * The window the module opens in, before the viewer picks another.
   *
   * Here rather than in a settings type of its own because it is the same kind of
   * knob as the two above — "what this module shows when you arrive" — and lives
   * in the same stored row. Each module keeps its own value, so Listening can open
   * on a fortnight while Played opens on a year.
   */
  defaultRange: ActivityRange;
}

/** Bounds for both counts, in one place so schema and sanitizer agree. */
export const LIST_DISPLAY_BOUNDS = { min: 1, max: 50 } as const;

const clampCount = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(LIST_DISPLAY_BOUNDS.max, Math.max(LIST_DISPLAY_BOUNDS.min, n));
};

/**
 * Clamp both counts into range and keep them coherent: `initialCount` can't exceed
 * `maxCount` (showing more collapsed than the list can ever hold is nonsense), so an
 * out-of-order pair pins `initialCount` down to `maxCount`. Any omitted field falls
 * back to the given default, so a partial body still writes a valid row.
 */
export function sanitizeListDisplaySettings(input: unknown, defaults: ListDisplaySettings): ListDisplaySettings {
  const obj = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const maxCount = clampCount("maxCount" in obj ? obj.maxCount : undefined, defaults.maxCount);
  const initialCount = Math.min(
    maxCount,
    clampCount("initialCount" in obj ? obj.initialCount : undefined, defaults.initialCount),
  );
  // An unlisted range falls back to the module's default rather than being
  // rejected: this reads rows written by an older UI that had no range at all.
  const defaultRange = sanitizeActivityRange(obj.defaultRange, defaults.defaultRange);
  return { initialCount, maxCount, defaultRange };
}

/**
 * Cap a list to `max` rows while reporting the true length, so the server can send
 * only what it allows and the client can still say "and N more" without ever seeing
 * the hidden rows. The single place this pairing lives — every list fetched from the
 * backend (top lists and day drill-ins alike) goes through here or a query LIMIT, so
 * the rule "the client never receives data past the cap" holds everywhere.
 */
export function capList<T>(rows: readonly T[], max: number): { rows: T[]; total: number } {
  return { rows: rows.slice(0, Math.max(0, Math.floor(max))), total: rows.length };
}
