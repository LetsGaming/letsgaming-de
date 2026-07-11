/**
 * The API origin, in one place.
 *
 * `PUBLIC_API_URL` points the browser at the API (empty = same origin). This was
 * previously re-derived — `(import.meta.env.PUBLIC_API_URL ?? "").replace(...)` —
 * in six files; now they all import from here so the rule lives once.
 */

/** API origin with any trailing slash stripped ("" when same-origin). */
export const apiBase = (import.meta.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** Build an absolute API URL from a root-relative path (e.g. `apiUrl("/api/contact")`). */
export const apiUrl = (path: string): string => `${apiBase}${path}`;
