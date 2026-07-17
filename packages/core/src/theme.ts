/**
 * The two themes.
 *
 * In core, not the web app, because four separate files had their own copy of
 * `"dark" | "light"` — the store's atom, the tracker's parameter, the analytics
 * vocabulary's `THEME_KEYS`, and the inline no-flash script — and the one that
 * carries a runtime list (analytics, which validates the value a browser sends)
 * was not the one the rest imported. That's the shape of §13's `Tone` bug: an
 * array annotated with a union checks that each value is valid, never that the
 * list is whole.
 *
 * The inline script in Layout.astro can't import this — it runs before hydration
 * — so it spells the values out. That's what `tests/storage-keys.test.ts` covers
 * for the key; the values are two words and the script fails safe to dark.
 */
export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

/** What the site renders as before a visitor says otherwise. */
export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** The other one. The toggle is the only caller, and `a === x ? y : x` at the
 *  call site is a place to get it backwards. */
export const otherTheme = (theme: Theme): Theme => (theme === "dark" ? "light" : "dark");
