import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { LANYARD_ACTIVITY_TYPE, type LanyardActivity } from "@lg/core";
import { openStore } from "@lg/db";
import type { ServerEnv } from "../src/env.js";
import { GAME_IMAGE_RETRY_MS, resolveGameImages } from "../src/sync/game-images.js";
import { PresenceSampler, bestApplication, dedupeActivities } from "../src/sync/presence-sampler.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const env = { discordUserId: "123" } as ServerEnv;

// Lanyard reports League of Legends twice at once: two linked Discord applications
// (each names the other in `official_game_id`) with different start times.
const LAUNCHED = 1791232833857;
const LOBBY = 1791234562254;
const custom: LanyardActivity = { type: 4, name: "Custom Status", state: "brb" };
const leagueProcess: LanyardActivity = {
  type: 0,
  name: "League of Legends",
  application_id: "1402418696126992445",
  timestamps: { start: LAUNCHED },
};
const leagueLobby: LanyardActivity = {
  type: 0,
  name: "League of Legends",
  application_id: "1443349464290168976",
  details: "ARAM: Chaos",
  assets: { large_image: "1489021253682597959" },
  timestamps: { start: LOBBY },
};

function lanyard(activities: unknown[]) {
  globalThis.fetch = (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { activities } }),
    } as Response)) as typeof fetch;
}

test("dedupeActivities keeps the earliest-started report of one game", () => {
  const kept = dedupeActivities([custom, leagueLobby, leagueProcess]);
  assert.deepEqual(
    kept.map((a) => [a.type, a.timestamps?.start]),
    [
      [4, undefined],
      [0, LAUNCHED],
    ],
  );
});

test("an undated report loses to a dated one, and different games are kept apart", () => {
  const undated: LanyardActivity = { type: 0, name: "League of Legends" };
  const other: LanyardActivity = { type: 0, name: "Minecraft", timestamps: { start: LOBBY } };
  const kept = dedupeActivities([undated, leagueLobby, other]);
  assert.equal(kept.length, 2);
  assert.equal(kept[0]?.timestamps?.start, LOBBY);
  assert.equal(kept[1]?.name, "Minecraft");
});

test("listening activities are never collapsed", () => {
  const a: LanyardActivity = { type: LANYARD_ACTIVITY_TYPE.Listening, name: "Spotify", sync_id: "a" };
  const b: LanyardActivity = { type: LANYARD_ACTIVITY_TYPE.Listening, name: "Spotify", sync_id: "b" };
  assert.equal(dedupeActivities([a, b]).length, 2);
});

test("bestApplication prefers the report that carries an image", () => {
  const best = bestApplication([leagueProcess, leagueLobby], "League of Legends");
  assert.deepEqual(best, { applicationId: "1443349464290168976", largeImage: "1489021253682597959" });
  assert.deepEqual(bestApplication([leagueProcess], "league of legends"), { applicationId: "1402418696126992445" });
  assert.equal(bestApplication([leagueProcess], "Minecraft"), undefined);
});

test("a game reported twice is recorded as one session, so its time is not counted twice", async () => {
  const store = openStore(":memory:");
  lanyard([custom, leagueProcess, leagueLobby]);
  const sampler = new PresenceSampler(env, store, "*/5 * * * *", () => {});
  // Two polls, a few minutes apart, both seeing both reports.
  await sampler.sample(new Date(LOBBY + 5 * 60_000));
  await sampler.sample(new Date(LOBBY + 10 * 60_000));

  const since = new Date(LAUNCHED - 86_400_000).toISOString();
  const [league] = store.sessions.playtime("game", since);
  assert.equal(league?.name, "League of Legends");
  assert.equal(league?.sessions, 1);
  const expected = Math.round((LOBBY + 10 * 60_000 - LAUNCHED) / 60_000);
  assert.equal(league?.minutes, expected, "one stretch from launch to the last poll");

  // The Discord application remembered for its image is the one that has art.
  assert.deepEqual(store.gameMeta.imageRows().map((r) => [r.applicationId, r.largeImage]), [
    ["1443349464290168976", "1489021253682597959"],
  ]);
});

/** The cutoff the sweep itself uses: only misses older than the retry window come back. */
const sweepCutoff = () => new Date(Date.now() - GAME_IMAGE_RETRY_MS).toISOString();

test("a blocked or erroring Discord answer is not recorded as 'no image'", async () => {
  const store = openStore(":memory:");
  store.gameMeta.noteApplication("Modrinth", "99");
  for (const status of [401, 403, 502]) {
    globalThis.fetch = (async () => new Response("blocked", { status })) as typeof fetch;
    assert.equal(await resolveGameImages(store), 0);
    assert.equal(store.gameMeta.pendingImages(sweepCutoff()).length, 1, `HTTP ${status} leaves the game pending`);
  }
});

test("only 'not found' counts as no image, and resetMisses reopens those games", async () => {
  const store = openStore(":memory:");
  store.gameMeta.noteApplication("Ghost", "98");
  store.gameMeta.noteApplication("Found", "97");
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes("/97/") || url.includes("/applications/97/")) {
      return url.includes("/rpc")
        ? Response.json({ id: "97", icon: "ic" })
        : new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;

  const logs: string[] = [];
  assert.equal(await resolveGameImages(store, (m) => logs.push(m)), 1);
  // Games are logged by their normalised key, with the Discord application beside it.
  assert.ok(logs.some((l) => l.includes("found: found https://cdn.discordapp.com/app-icons/97/ic.png")));
  assert.ok(logs.some((l) => l.includes("ghost: Discord has no image (application 98)")));

  assert.equal(store.gameMeta.pendingImages(sweepCutoff()).length, 0, "the miss is recorded");
  assert.equal(store.gameMeta.resetMisses(), 1, "only the missed game is reset");
  assert.deepEqual(store.gameMeta.pendingImages(sweepCutoff()).map((g) => g.name), ["ghost"]);
});
