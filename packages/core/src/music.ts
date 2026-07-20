import {
  LIST_DISPLAY_BOUNDS,
  sanitizeListDisplaySettings,
  type ListDisplaySettings,
} from "./list-settings.js";

/**
 * CMS-owned display config for the Listening module — the shared list-display shape
 * (`initialCount` / `maxCount`).
 *
 * `maxCount` is enforced *server-side*, as a LIMIT on the top-N query, so the
 * frontend never receives more rows than this — it can't count or leak past the cap
 * (the project rule: the client knows nothing it wasn't given). The distinct "tracks
 * played" / "different artists" totals are separate COUNT queries and are deliberately
 * *not* capped: the headline stays the true total even when the list is trimmed to
 * the top N, and drives the "and N more" note.
 */
export type MusicSettings = ListDisplaySettings;

/** Re-exported under the module's name so callers keep importing it from here. */
export const MUSIC_LIST_BOUNDS = LIST_DISPLAY_BOUNDS;

export function defaultMusicSettings(): MusicSettings {
  return { initialCount: 5, maxCount: 15 };
}

export function sanitizeMusicSettings(input: unknown): MusicSettings {
  return sanitizeListDisplaySettings(input, defaultMusicSettings());
}
