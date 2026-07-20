import { sanitizeListDisplaySettings, type ListDisplaySettings } from "./list-settings.js";

/**
 * CMS-owned display config for the Playtime module — the same list-display shape as
 * Listening, stored separately so the two can carry different limits (the top-games
 * list and its per-day drill-in are capped by `maxCount`, collapsed to `initialCount`).
 *
 * Unlike Listening, the recent-games list is small enough over a fortnight to ship
 * whole, so the cap is applied in the view rather than as a query LIMIT; the true
 * total is just the list length. The shared `useLimitedList` treats both the same.
 */
export type PlaytimeSettings = ListDisplaySettings;

export function defaultPlaytimeSettings(): PlaytimeSettings {
  return { initialCount: 5, maxCount: 15 };
}

export function sanitizePlaytimeSettings(input: unknown): PlaytimeSettings {
  return sanitizeListDisplaySettings(input, defaultPlaytimeSettings());
}
