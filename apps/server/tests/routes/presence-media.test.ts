import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import sharp from "sharp";
import { openStore } from "@lg/db";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/env.js";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

async function build() {
	const store = openStore(":memory:");
	const env = loadEnv({ WEB_ORIGIN: "http://localhost:4321" });
	return buildApp(store, env);
}

test("game fallback returns a labelled SVG tile", async () => {
	const app = await build();
	const res = await app.inject({
		method: "GET",
		url: "/api/presence/media?game=Valorant",
	});
	assert.equal(res.statusCode, 200);
	assert.match(String(res.headers["content-type"]), /image\/svg\+xml/);
	assert.match(res.body, /aria-label="Valorant"/);
	assert.match(res.body, />VA</); // initials
	await app.close();
});

test("the placeholder tile is cached briefly so later art is not pinned out", async () => {
	const app = await build();
	const res = await app.inject({
		method: "GET",
		url: "/api/presence/media?game=Modrinth",
	});
	const maxAge = Number(/max-age=(\d+)/.exec(String(res.headers["cache-control"]))?.[1]);
	assert.ok(maxAge > 0 && maxAge <= 600, `tile max-age ${maxAge} should be a few minutes, not a day`);
	await app.close();
});

test("game name is XML-escaped in the tile (no SVG injection)", async () => {
	const app = await build();
	const res = await app.inject({
		method: "GET",
		url: `/api/presence/media?game=${encodeURIComponent("<script>x</script>")}`,
	});
	assert.equal(res.statusCode, 200);
	assert.doesNotMatch(res.body, /<script>/);
	await app.close();
});

test("proxies an allow-listed image", async () => {
	const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
	let requested = "";
	globalThis.fetch = (async (input: unknown) => {
		requested = String(input);
		return new Response(bytes, {
			status: 200,
			headers: { "content-type": "image/png" },
		});
	}) as typeof fetch;

	const app = await build();
	const url = "https://cdn.discordapp.com/avatars/1/abc.png?size=128";
	const res = await app.inject({
		method: "GET",
		url: `/api/presence/media?u=${encodeURIComponent(url)}`,
	});
	assert.equal(res.statusCode, 200);
	assert.equal(res.headers["content-type"], "image/png");
	assert.ok(requested.includes("cdn.discordapp.com"));
	assert.equal(res.rawPayload.length, bytes.length);
	await app.close();
});

/** A real PNG at the size GitHub serves a repository preview. */
async function repoPreviewPng(): Promise<Buffer> {
	return sharp({
		create: { width: 1200, height: 630, channels: 3, background: "#ffffff" },
	})
		.png()
		.toBuffer();
}

test("a repository preview is proxied from GitHub and downscaled to a small WebP", async () => {
	const png = await repoPreviewPng();
	let requested = "";
	globalThis.fetch = (async (input: unknown) => {
		requested = String(input);
		return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
	}) as typeof fetch;

	const app = await build();
	for (const url of [
		"https://opengraph.githubassets.com/1/LetsGaming/downscale-a",
		"https://repository-images.githubusercontent.com/1/downscale-b",
	]) {
		const res = await app.inject({
			method: "GET",
			url: `/api/presence/media?u=${encodeURIComponent(url)}`,
		});
		assert.equal(res.statusCode, 200, url);
		assert.equal(res.headers["content-type"], "image/webp");
		assert.ok(requested.startsWith(url), "fetched the requested GitHub URL");
		const meta = await sharp(res.rawPayload).metadata();
		assert.equal(meta.format, "webp");
		assert.equal(meta.width, 800, "capped at the card width");
		assert.ok(res.rawPayload.length < png.length);
	}
	await app.close();
});

test("a rate-limited upstream serves the last good copy briefly instead of failing", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 8, 12) });
	const png = await repoPreviewPng();
	const url = "https://opengraph.githubassets.com/1/LetsGaming/stale-copy";
	globalThis.fetch = (async () =>
		new Response(png, { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch;

	const app = await build();
	const get = () =>
		app.inject({ method: "GET", url: `/api/presence/media?u=${encodeURIComponent(url)}` });

	const first = await get();
	assert.equal(first.statusCode, 200);
	assert.match(String(first.headers["cache-control"]), /max-age=604800/);

	// Long after the cached copy expired, GitHub starts answering 429.
	t.mock.timers.tick(60 * 60_000);
	globalThis.fetch = (async () => new Response("slow down", { status: 429 })) as typeof fetch;
	const second = await get();
	assert.equal(second.statusCode, 200, "the expired copy is served instead of an error");
	assert.equal(second.rawPayload.length, first.rawPayload.length);
	assert.match(String(second.headers["cache-control"]), /max-age=300/, "short lifetime so the next visit retries");

	// An image that was never cached still fails cleanly.
	const unseen = await app.inject({
		method: "GET",
		url: `/api/presence/media?u=${encodeURIComponent("https://opengraph.githubassets.com/1/LetsGaming/never-seen")}`,
	});
	assert.equal(unseen.statusCode, 404);
	await app.close();
});

test("refuses a non-allow-listed host WITHOUT any outbound fetch (SSRF guard)", async () => {
	let fetched = false;
	globalThis.fetch = (async () => {
		fetched = true;
		return new Response("", { status: 200 });
	}) as typeof fetch;

	const app = await build();
	const evil = "http://169.254.169.254/latest/meta-data/"; // link-local metadata
	const res = await app.inject({
		method: "GET",
		url: `/api/presence/media?u=${encodeURIComponent(evil)}`,
	});
	assert.equal(res.statusCode, 404); // no upstream, no game fallback
	assert.equal(fetched, false, "must not fetch a non-allow-listed host");
	await app.close();
});

test("a blocked upstream falls back to the game tile when a name is given", async () => {
	globalThis.fetch = (async () => {
		throw new Error("should not be called");
	}) as typeof fetch;

	const app = await build();
	const res = await app.inject({
		method: "GET",
		url: `/api/presence/media?u=${encodeURIComponent("https://evil.example/x.png")}&game=${encodeURIComponent("Foo Bar")}`,
	});
	assert.equal(res.statusCode, 200);
	assert.match(String(res.headers["content-type"]), /image\/svg\+xml/);
	assert.match(res.body, />FB</);
	await app.close();
});

test("non-image upstream is rejected", async () => {
	globalThis.fetch = (async () =>
		new Response("<html>nope</html>", {
			status: 200,
			headers: { "content-type": "text/html" },
		})) as typeof fetch;

	const app = await build();
	const url = "https://i.scdn.co/image/whatever";
	const res = await app.inject({
		method: "GET",
		url: `/api/presence/media?u=${encodeURIComponent(url)}`,
	});
	assert.equal(res.statusCode, 404); // not an image, no game fallback
	await app.close();
});

test("a game with no handed-in image resolves its RAWG cover before initials", async () => {
	const store = openStore(":memory:");
	store.gameMeta.put("Hades", {
		coverUrl: "https://media.rawg.io/media/games/hades.jpg",
	});

	// The resolved cover should be fetched from the allow-listed rawg host. (The
	// fake bytes aren't a decodable image, so the downscale step falls back to the
	// original bytes — which is exactly the resilience we want to exercise.)
	const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
	let requested = "";
	globalThis.fetch = (async (input: unknown) => {
		requested = String(input);
		return new Response(png, {
			status: 200,
			headers: { "content-type": "image/png" },
		});
	}) as typeof fetch;

	const env = loadEnv({ WEB_ORIGIN: "http://localhost:4321" });
	const app = await buildApp(store, env);
	const res = await app.inject({
		method: "GET",
		url: `/api/presence/media?game=${encodeURIComponent("Hades")}`,
	});
	assert.equal(res.statusCode, 200);
	assert.ok(requested.includes("media.rawg.io"), "should fetch the resolved cover");
	assert.doesNotMatch(String(res.headers["content-type"]), /svg/); // a real image, not the tile
	await app.close();
});

test("a game with no cover in the cache still falls back to the initials tile", async () => {
	globalThis.fetch = (async () => {
		throw new Error("should not be called — no cover to fetch");
	}) as typeof fetch;

	const store = openStore(":memory:"); // empty metadata cache
	const env = loadEnv({ WEB_ORIGIN: "http://localhost:4321" });
	const app = await buildApp(store, env);
	const res = await app.inject({
		method: "GET",
		url: `/api/presence/media?game=${encodeURIComponent("Valorant")}`,
	});
	assert.equal(res.statusCode, 200);
	assert.match(String(res.headers["content-type"]), /image\/svg\+xml/);
	assert.match(res.body, />VA</);
	await app.close();
});

test("no parameters -> 404", async () => {
	const app = await build();
	const res = await app.inject({ method: "GET", url: "/api/presence/media" });
	assert.equal(res.statusCode, 404);
	await app.close();
});
