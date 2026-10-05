import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "../src/index.js";

const iso = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 17, h, m)).toISOString();

test("a reaction counter starts at zero and only ever goes up by one", () => {
  const store = openStore(":memory:");
  assert.equal(store.reactions.count("wave"), 0);
  assert.equal(store.reactions.increment("wave"), 1);
  assert.equal(store.reactions.increment("wave"), 2);
  assert.equal(store.reactions.count("wave"), 2);
  assert.equal(store.reactions.count("other"), 0, "counters are per kind");
});

test("recent games are one row per name, newest first", () => {
  const store = openStore(":memory:");
  const obs = (name: string, start: string, seen: string) =>
    store.sessions.observe({ category: "game", name, startedAt: start, seenAt: seen, startedExact: true });
  obs("Minecraft", iso(10), iso(11));
  obs("Minecraft", iso(14), iso(15));
  obs("Factorio", iso(12), iso(13));
  assert.deepEqual(store.sessions.recent("game", 10), [
    { name: "Minecraft", at: iso(15) },
    { name: "Factorio", at: iso(13) },
  ]);
  assert.equal(store.sessions.recent("game", 1).length, 1);
});

test("the latest song ignores podcast episodes", () => {
  const store = openStore(":memory:");
  store.music.observe({
    trackId: "t1", song: "A Song", artist: "An Artist", album: "Alb", startedAt: iso(10), seenAt: iso(11),
  });
  store.music.observe({
    trackId: "e1", song: "An Episode", artist: "", album: "A Show", startedAt: iso(12), seenAt: iso(13), kind: "episode",
  });
  assert.deepEqual(store.music.latest(), { name: "A Song", at: iso(11) });
});
