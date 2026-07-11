import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
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

test("no parameters -> 404", async () => {
	const app = await build();
	const res = await app.inject({ method: "GET", url: "/api/presence/media" });
	assert.equal(res.statusCode, 404);
	await app.close();
});
