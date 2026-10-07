import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import sharp from "sharp";
import { openStore } from "@lg/db";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";
import { darkenRepoCard } from "../src/routes/repo-card.js";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

const AVATAR = [0x7a, 0x3f, 0xd0] as const;

/** A 1200x600 card laid out like GitHub's: dark text, a coloured language bar and a
 *  circular logo avatar (white inside, white corners around it) in the top-right slot. */
async function card(height = 600, withBar = true): Promise<Buffer> {
	const bar = withBar
		? `<rect x="0" y="${height - 24}" width="800" height="24" fill="#3178c6"/><rect x="800" y="${height - 24}" width="400" height="24" fill="#f1e05a"/>`
		: "";
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}">
		<rect x="80" y="80" width="300" height="60" fill="#2c3239"/>
		${bar}
		<circle cx="1020" cy="180" r="100" fill="rgb(${AVATAR.join(",")})"/>
		<circle cx="1020" cy="180" r="30" fill="#ffffff"/>
	</svg>`;
	return sharp({ create: { width: 1200, height, channels: 3, background: "#ffffff" } })
		.composite([{ input: Buffer.from(svg) }])
		.png()
		.toBuffer();
}

async function pixels(image: Buffer) {
	const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	return (x: number, y: number) => {
		const i = (y * info.width + x) * 3;
		return [data[i]!, data[i + 1]!, data[i + 2]!];
	};
}

test("the card is inverted: a white background goes dark and dark text goes light", async () => {
	const at = await pixels(await darkenRepoCard(await card()));
	assert.ok(at(10, 10).every((c) => c < 25), `background ${at(10, 10)}`);
	assert.ok(at(200, 110).every((c) => c > 150), `text ${at(200, 110)}`);
});

test("the language bar keeps GitHub's language colours exactly", async () => {
	const at = await pixels(await darkenRepoCard(await card()));
	const near = (px: number[], want: number[]) => want.every((c, i) => Math.abs(px[i]! - c) <= 3);
	assert.ok(near(at(400, 590), [0x31, 0x78, 0xc6]), `TypeScript blue: ${at(400, 590)}`);
	assert.ok(near(at(1000, 590), [0xf1, 0xe0, 0x5a]), `JavaScript yellow: ${at(1000, 590)}`);
});

test("a pale language colour in the bar does not stop the bar being restored", async () => {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600">
		<rect x="0" y="576" width="600" height="24" fill="#3178c6"/>
		<rect x="600" y="576" width="600" height="24" fill="#f0f0f0"/>
	</svg>`;
	const pale = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#ffffff" } })
		.composite([{ input: Buffer.from(svg) }])
		.png()
		.toBuffer();
	const at = await pixels(await darkenRepoCard(pale));
	const near = (px: number[], want: number[]) => want.every((c, i) => Math.abs(px[i]! - c) <= 3);
	assert.ok(near(at(300, 590), [0x31, 0x78, 0xc6]), `blue segment: ${at(300, 590)}`);
	assert.ok(near(at(900, 590), [0xf0, 0xf0, 0xf0]), `pale segment: ${at(900, 590)}`);
});

test("a repository with no language has no bar, so the bottom edge stays dark", async () => {
	const at = await pixels(await darkenRepoCard(await card(600, false)));
	assert.ok(at(400, 590).every((c) => c < 25), `no white strip: ${at(400, 590)}`);
});

test("the avatar is left exactly as drawn, including the white inside a logo", async () => {
	const at = await pixels(await darkenRepoCard(await card()));
	for (const [x, y] of [[1020, 110], [960, 180], [1080, 180]] as const) {
		const px = at(x, y);
		AVATAR.forEach((c, i) => assert.ok(Math.abs(px[i]! - c) <= 3, `avatar ${x},${y}: ${px}`));
	}
	assert.ok(at(1020, 180).every((c) => c >= 245), "white inside the logo stays white");
});

test("the white corners around a round avatar are background, not a white box", async () => {
	const at = await pixels(await darkenRepoCard(await card()));
	// Inside the 200px slot but outside the circle.
	for (const [x, y] of [[925, 85], [1114, 85], [925, 274], [1114, 274]] as const) {
		assert.ok(at(x, y).every((c) => c < 25), `corner ${x},${y}: ${at(x, y)}`);
	}
});

test("anything that is not a repository card of the known size comes back unchanged", async () => {
	const generic = await card(630); // GitHub's placeholder for a repository it cannot render
	assert.ok((await darkenRepoCard(generic)).equals(generic));
	const tiny = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
	assert.ok((await darkenRepoCard(tiny)).equals(tiny));
});

async function build() {
	const store = openStore(":memory:");
	return buildApp(store, loadEnv({ WEB_ORIGIN: "http://localhost:4321" }));
}

test("the proxy serves the dark card for theme=dark and the light card otherwise", async () => {
	const png = await card();
	globalThis.fetch = (async () =>
		new Response(png, { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch;
	const app = await build();
	const url = encodeURIComponent("https://opengraph.githubassets.com/1/LetsGaming/dark-variant");

	const light = await app.inject({ method: "GET", url: `/api/presence/media?u=${url}` });
	const dark = await app.inject({ method: "GET", url: `/api/presence/media?u=${url}&theme=dark` });
	assert.equal(light.statusCode, 200);
	assert.equal(dark.statusCode, 200);
	assert.equal(dark.headers["content-type"], "image/webp");

	const bg = async (res: typeof light) => (await pixels(await sharp(res.rawPayload).png().toBuffer()))(5, 5);
	assert.ok((await bg(light)).every((c) => c > 230), "the light card keeps its white background");
	assert.ok((await bg(dark)).every((c) => c < 40), "the dark card has a dark background");
	await app.close();
});

test("an uploaded preview is never recoloured, even when the dark theme asks", async () => {
	const png = await card();
	globalThis.fetch = (async () =>
		new Response(png, { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch;
	const app = await build();
	const url = encodeURIComponent("https://repository-images.githubusercontent.com/1/uploaded-preview");
	const res = await app.inject({ method: "GET", url: `/api/presence/media?u=${url}&theme=dark` });
	assert.equal(res.statusCode, 200);
	const at = await pixels(await sharp(res.rawPayload).png().toBuffer());
	assert.ok(at(5, 5).every((c) => c > 230), "still the owner's own image");
	await app.close();
});
