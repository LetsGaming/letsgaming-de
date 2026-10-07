/**
 * The API origin, in one place.
 *
 * `PUBLIC_API_URL` points the browser at the API (empty = same origin). This was
 * previously re-derived — `(import.meta.env.PUBLIC_API_URL ?? "").replace(...)` —
 * in six files; now they all import from here so the rule lives once.
 */

/** API origin with any trailing slash stripped ("" when same-origin). */
export const apiBase = (import.meta.env.PUBLIC_API_URL ?? "").replace(
	/\/$/,
	"",
);

/** Build an absolute API URL from a root-relative path (e.g. `apiUrl("/api/contact")`). */
export const apiUrl = (path: string): string => `${apiBase}${path}`;

/**
 * URL for a presence image, routed through our own server so the browser never
 * contacts Discord/RAWG/Spotify directly (their CDNs would otherwise see the
 * visitor's IP). Pass the upstream `url` when the API gave one; pass `game` so
 * the server can fall back to a labelled tile when there's no usable image.
 * `theme: "dark"` asks for the dark version of an image that has one (GitHub's
 * generated repository card); anything else is ignored by the server.
 * Returns `undefined` when there's nothing to show.
 */
export function presenceMediaUrl(opts: { url?: string; game?: string; theme?: "dark" }):
	| string
	| undefined {
	const params = new URLSearchParams();
	if (opts.url) params.set("u", opts.url);
	if (opts.game) params.set("game", opts.game);
	if (opts.theme) params.set("theme", opts.theme);
	const qs = params.toString();
	return qs ? apiUrl(`/api/presence/media?${qs}`) : undefined;
}
