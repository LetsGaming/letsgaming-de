/**
 * CMS-owned display config for the Listening module.
 *
 * Two knobs on how the top-songs / top-artists lists are shown:
 *  - `initialCount` — rows visible before the "show more" toggle.
 *  - `maxCount`     — the most rows the list will ever show (a "top N" cap).
 *
 * `maxCount` is enforced *server-side*, as a LIMIT on the top-N query, so the
 * frontend never receives more rows than this — it can't count or leak past the
 * cap (the project rule: the client knows nothing it wasn't given). The distinct
 * "tracks played" / "different artists" totals are separate COUNT queries and are
 * deliberately *not* capped: the headline stays the true total even when the list
 * is trimmed to the top N.
 */
export interface MusicSettings {
  /** Rows shown before "show more". */
  initialCount: number;
  /** Hard cap on rows the list ever shows (applied as a query LIMIT). */
  maxCount: number;
}

/** Bounds for both counts, in one place so the schema and the sanitizer agree. */
export const MUSIC_LIST_BOUNDS = { min: 1, max: 50 } as const;

export function defaultMusicSettings(): MusicSettings {
  return { initialCount: 5, maxCount: 15 };
}

const clampCount = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(MUSIC_LIST_BOUNDS.max, Math.max(MUSIC_LIST_BOUNDS.min, n));
};

/**
 * Clamp both counts into range and keep them coherent: `initialCount` can't exceed
 * `maxCount` (showing more collapsed than the list can ever hold is nonsense), so
 * an out-of-order pair pins `initialCount` down to `maxCount`. Any omitted field
 * falls back to its default, so a partial body still writes a valid row.
 */
export function sanitizeMusicSettings(input: unknown): MusicSettings {
  const obj = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const d = defaultMusicSettings();
  const maxCount = clampCount("maxCount" in obj ? obj.maxCount : undefined, d.maxCount);
  const initialCount = Math.min(
    maxCount,
    clampCount("initialCount" in obj ? obj.initialCount : undefined, d.initialCount),
  );
  return { initialCount, maxCount };
}
