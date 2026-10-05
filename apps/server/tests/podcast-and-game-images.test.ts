import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { classifySpotify, normalizePresence, type LanyardData } from "@lg/core";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openStore } from "@lg/db";
import type { ServerEnv } from "../src/env.js";
import { resolveGameImages } from "../src/sync/game-images.js";
import { PresenceSampler } from "../src/sync/presence-sampler.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const START = Date.UTC(2026, 6, 17, 20, 0);
const SINCE = new Date(Date.UTC(2026, 6, 1)).toISOString();

// Appendix A: a podcast episode has no `state`.
const episode = {
  type: 2,
  name: "Spotify",
  details: "Das letzte Familienessen",
  sync_id: "6IR7khdheMvsfdoYsJRQp0",
  assets: { large_image: "spotify:ab6765630000ba8ad506006ba7028ab4d495eeff", large_text: "MORD AUF EX" },
  timestamps: { start: START },
};
const minecraft = { type: 0, name: "Minecraft", application_id: "1402418491272986635", timestamps: { start: START } };

function lanyard(activities: unknown[]) {
  globalThis.fetch = (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { activities } }),
    } as Response)) as typeof fetch;
}

const env = { discordUserId: "123" } as ServerEnv;

/** A file-backed store plus a way to read raw rows from it. */
function fileStore() {
  const path = join(mkdtempSync(join(tmpdir(), "lg-pod-")), "t.sqlite");
  const store = openStore(path);
  const kinds = (): string[] => {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      return (db.prepare("SELECT kind FROM music_plays ORDER BY id").all() as { kind: string }[]).map((r) => r.kind);
    } finally {
      db.close();
    }
  };
  return { store, kinds };
}

test("classifySpotify: no artist is an episode, show-image prefix is a secondary signal", () => {
  assert.equal(classifySpotify({}), "episode");
  assert.equal(classifySpotify({ state: "  " }), "episode");
  assert.equal(classifySpotify({ state: "Artist", assets: { large_image: "spotify:ab67616d0000b273x" } }), "track");
  assert.equal(classifySpotify({ state: "Host", assets: { large_image: "spotify:ab6765630000ba8a" } }), "episode");
});

test("the sample podcast activity is stored as an episode, not a song", async () => {
  const { store, kinds } = fileStore();
  store.content.setPresence({ show: [], sample: ["music", "podcast"], retentionDays: null, hidden: [] });
  lanyard([episode]);
  const sampler = new PresenceSampler(env, store, "*/5 * * * *", () => {});
  assert.equal(await sampler.sample(new Date(START + 10 * 60000)), 1);

  assert.deepEqual(store.music.topSongs(SINCE, 10), []);
  assert.deepEqual(store.music.topArtists(SINCE, 10), []);
  assert.equal(store.music.distinctTracks(SINCE), 0);
  assert.equal(store.music.totalMinutes(SINCE), 0);
  assert.deepEqual(kinds(), ["episode"]);
});

test("the podcast Record switch gates recording independently of music", async () => {
  const { store, kinds } = fileStore();
  store.content.setPresence({ show: [], sample: ["music"], retentionDays: null, hidden: [] });
  lanyard([episode, { type: 2, name: "Spotify", details: "Song", state: "Artist", sync_id: "s1", timestamps: { start: START } }]);
  const sampler = new PresenceSampler(env, store, "*/5 * * * *", () => {});
  assert.equal(await sampler.sample(new Date(START + 5 * 60000)), 1, "only the song is recorded");
  assert.deepEqual(kinds(), ["track"]);
});

test("the live card for an episode is a podcast card gated by its own Show switch", () => {
  const data: LanyardData = {
    listening_to_spotify: true,
    spotify: { song: "Das letzte Familienessen", artist: null, album: "MORD AUF EX" },
    activities: [{ ...episode }],
  };
  assert.deepEqual(normalizePresence(data, ["music"]).cards, []);
  const cards = normalizePresence(data, ["podcast"]).cards;
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.category, "podcast");
  assert.equal(cards[0]?.subtitle, "MORD AUF EX");
});

test("game application id is recorded when a game session is observed", async () => {
  const store = openStore(":memory:");
  lanyard([minecraft]);
  await new PresenceSampler(env, store, "*/5 * * * *", () => {}).sample(new Date(START + 10 * 60000));
  assert.equal(store.gameMeta.pendingImages(new Date(START + 86400000).toISOString()).length, 1);
});

function stubDiscord(opts: { iconHash?: string | null; imageOk: (url: string) => boolean }) {
  const seen: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("/rpc")) {
      return opts.iconHash === null
        ? new Response("nope", { status: 404 })
        : Response.json({ id: "1", icon: opts.iconHash });
    }
    return opts.imageOk(url)
      ? new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } })
      : new Response("gone", { status: 404 });
  }) as typeof fetch;
  return seen;
}

test("the application icon is used when the activity has no image (Minecraft sample)", async () => {
  const store = openStore(":memory:");
  store.gameMeta.noteApplication("Minecraft", "1402418491272986635");
  const seen = stubDiscord({ iconHash: "166fbad351ecdd02d11a3b464748f66b", imageOk: () => true });
  assert.equal(await resolveGameImages(store), 1);
  const icon = "https://cdn.discordapp.com/app-icons/1402418491272986635/166fbad351ecdd02d11a3b464748f66b.png";
  assert.equal(store.gameMeta.getAll().get("minecraft")?.coverUrl, icon);
  assert.ok(seen.some((u) => u.includes("/applications/1402418491272986635/rpc")));
});

test("an activity image wins over the icon, and mp: maps to media.discordapp.net", async () => {
  const store = openStore(":memory:");
  store.gameMeta.noteApplication("Ext", "42", "mp:external/abc/https/x.example/a.png");
  store.gameMeta.noteApplication("Asset", "43", "9999");
  const seen = stubDiscord({ iconHash: "ic", imageOk: () => true });
  assert.equal(await resolveGameImages(store), 2);
  const all = store.gameMeta.getAll();
  assert.equal(all.get("ext")?.coverUrl, "https://media.discordapp.net/external/abc/https/x.example/a.png");
  assert.equal(all.get("asset")?.coverUrl, "https://cdn.discordapp.com/app-assets/43/9999.png");
  assert.ok(!seen.some((u) => u.includes("/rpc")), "icon lookup skipped when the activity image works");
});

test("a failing activity image falls through to the icon", async () => {
  const store = openStore(":memory:");
  store.gameMeta.noteApplication("Game", "50", "1234");
  stubDiscord({ iconHash: "ic", imageOk: (u) => u.includes("app-icons") });
  await resolveGameImages(store);
  assert.equal(store.gameMeta.getAll().get("game")?.coverUrl, "https://cdn.discordapp.com/app-icons/50/ic.png");
});

test("a non-Discord https large_image is ignored", async () => {
  const store = openStore(":memory:");
  store.gameMeta.noteApplication("Game", "51", "https://evil.example/x.png");
  const seen = stubDiscord({ iconHash: null, imageOk: () => true });
  await resolveGameImages(store);
  assert.ok(!seen.some((u) => u.includes("evil.example")));
});

test("a miss is cached for 7 days, then retried", async () => {
  const store = openStore(":memory:");
  store.gameMeta.noteApplication("Ghost", "60");
  const seen = stubDiscord({ iconHash: null, imageOk: () => false });
  const t0 = new Date(START);
  assert.equal(await resolveGameImages(store, undefined, t0), 0);
  const calls = seen.length;
  assert.ok(calls > 0);
  await resolveGameImages(store, undefined, new Date(START + 6 * 86400000));
  assert.equal(seen.length, calls, "no new lookups inside the retry window");
  await resolveGameImages(store, undefined, new Date(START + 8 * 86400000));
  assert.ok(seen.length > calls, "retried after 7 days");
  assert.equal(store.gameMeta.getAll().get("ghost"), undefined, "no image, so the letter is shown");
});
