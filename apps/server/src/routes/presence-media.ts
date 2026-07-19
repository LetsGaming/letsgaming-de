/**
 * Presence media proxy.
 *
 * The presence widget and playtime shelf show images that originate at
 * third-party CDNs (Discord avatars/activity art, RAWG game cover art, Spotify
 * album covers). Loading those
 * directly in the browser would leak every visitor's IP to those providers — the
 * one place the site would otherwise break its "server is the boundary" stance.
 * So the browser asks *us* for the image and the server fetches it, exactly like
 * every other upstream: the visitor only ever talks to this origin.
 *
 * Because a URL-taking proxy is a classic SSRF vector, `u` is fetched ONLY when
 * its host is on a fixed allow-list (and only over https, with redirects
 * refused) — a crafted `u` can never reach an internal address.
 *
 * Second job: a fallback. Some games have no art from the API (e.g. Valorant).
 * When there's no usable image, `game=<name>` yields a labelled tile — a
 * per-game override if we ship one, otherwise a generated initials tile — so the
 * widget always has something tidy to show.
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { notFound } from "../errors.js";

/** Exact hosts we will fetch from — nothing else. Keeps this from being an open proxy. */
const ALLOWED_HOSTS = new Set([
	"cdn.discordapp.com",
	"media.discordapp.net",
	"media.rawg.io",
	"i.scdn.co",
]);

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 5 * 1024 * 1024; // presence art is small; refuse anything large
const CACHE_MAX = 96;
const CACHE_TTL_MS = 10 * 60_000;

interface Bytes {
	at: number;
	contentType: string;
	body: Buffer;
}

// Tiny in-memory LRU so a page full of visitors doesn't re-hit the CDNs for the
// same handful of images every time (browser + Cloudflare cache the rest).
const cache = new Map<string, Bytes>();
function cacheGet(key: string): Bytes | undefined {
	const hit = cache.get(key);
	if (!hit) return undefined;
	if (Date.now() - hit.at > CACHE_TTL_MS) {
		cache.delete(key);
		return undefined;
	}
	cache.delete(key);
	cache.set(key, hit); // bump to most-recent
	return hit;
}
function cacheSet(key: string, value: Bytes): void {
	cache.set(key, value);
	while (cache.size > CACHE_MAX) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
}

/** Fetch an allow-listed image server-side. Returns null on any rejection. */
async function fetchUpstream(raw: string): Promise<Bytes | null> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname))
		return null;

	try {
		const res = await fetch(url, {
			redirect: "error", // a redirect could bounce off the allow-list — refuse it
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { Accept: "image/*" },
		});
		if (!res.ok) return null;
		const contentType = res.headers.get("content-type") ?? "";
		if (!contentType.startsWith("image/")) return null;
		const declared = Number(res.headers.get("content-length") ?? "0");
		if (declared > MAX_BYTES) return null;
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.byteLength > MAX_BYTES) return null;
		return { at: Date.now(), contentType, body: buf };
	} catch {
		return null; // timeout, redirect, network, abort — caller falls back
	}
}

function xmlEscape(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Stable 0–359 hue from a string, so a given game always gets the same colour. */
function hueOf(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
	return h;
}

/** Normalize a game name to a lookup key for {@link GAME_ART}. */
function slug(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Per-game art overrides (add entries as needed). Values are full SVG documents;
 *  keys are {@link slug}s of the game name. Left empty by default — the generated
 *  tile below already gives every game a clean labelled fallback. */
const GAME_ART: Record<string, string> = {};

/** A deterministic initials tile for a game with no upstream art. */
function gameTile(name: string): string {
	const clean = name.trim() || "Game";
	const words = clean.split(/\s+/).filter(Boolean);
	const initials = (
		words.length > 1
			? (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")
			: clean.slice(0, 2)
	).toUpperCase();
	const hue = hueOf(clean);
	const c1 = `hsl(${hue} 58% 44%)`;
	const c2 = `hsl(${(hue + 38) % 360} 52% 26%)`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${xmlEscape(
		clean,
	)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="96" height="96" rx="18" fill="url(#g)"/><text x="48" y="52" font-family="system-ui,'Segoe UI',Roboto,sans-serif" font-size="38" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${xmlEscape(
		initials,
	)}</text></svg>`;
}

function sendBytes(
	reply: FastifyReply,
	b: Bytes,
	maxAge: number,
): FastifyReply {
	reply.header("Content-Type", b.contentType);
	reply.header("Cache-Control", `public, max-age=${maxAge}`);
	reply.header("X-Content-Type-Options", "nosniff");
	return reply.send(b.body);
}

function sendTile(reply: FastifyReply, svg: string): FastifyReply {
	reply.header("Content-Type", "image/svg+xml; charset=utf-8");
	reply.header("Cache-Control", "public, max-age=86400");
	reply.header("X-Content-Type-Options", "nosniff");
	return reply.send(svg);
}

export function registerPresenceMediaRoutes(app: FastifyInstance): void {
	app.get<{ Querystring: { u?: string; game?: string } }>(
		"/api/presence/media",
		async (req, reply) => {
			const { u, game } = req.query;

			if (u) {
				const cached = cacheGet(u);
				if (cached) return sendBytes(reply, cached, 604_800);
				const fresh = await fetchUpstream(u);
				if (fresh) {
					cacheSet(u, fresh);
					return sendBytes(reply, fresh, 604_800);
				}
				// fell through: upstream missing/blocked — try the game fallback below
			}

			if (game) {
				return sendTile(reply, GAME_ART[slug(game)] ?? gameTile(game));
			}

			throw notFound("No image.");
		},
	);
}
