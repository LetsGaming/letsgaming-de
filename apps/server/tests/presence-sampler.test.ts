import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import { sessionSubject } from "../src/sync/presence-sampler.js";
import type { LanyardActivity } from "@lg/core";

// A Spotify listen as Lanyard actually sends it: type 2, name is always
// "Spotify", the song is in `details`, and the artist — the thing worth
// charting — is in `state`.
const spotify = (
  song: string,
  artist: string,
  start?: number,
  trackId = `track-${song}`,
): LanyardActivity => ({
  type: 2,
  name: "Spotify",
  details: song,
  state: artist,
  sync_id: trackId,
  assets: { large_text: "An Album" },
  ...(start ? { timestamps: { start } } : {}),
});

const game = (name: string, start?: number): LanyardActivity => ({
  type: 0,
  name,
  ...(start ? { timestamps: { start } } : {}),
});

// ── the subject rule ─────────────────────────────────────────────────────────

test("a game's subject is its own name", () => {
  assert.equal(sessionSubject("game", game("Factorio")), "Factorio");
});

test("music no longer routes through sessionSubject — it has its own table", () => {
  // Music used to be a session keyed on the artist. It's now a full track play
  // (song + artists + album) in music_plays, so sessionSubject only handles the
  // categories that are still one subject.
  assert.equal(sessionSubject("game", game("Factorio")), "Factorio");
  assert.equal(sessionSubject("streaming", game("Just Chatting")), "Just Chatting");
  assert.equal(sessionSubject("watching", { type: 3, name: "YouTube" }), "YouTube");
});

// ── the sampler respects the record allow-list (the correctness fix) ─────────
import { PresenceSampler } from "../src/sync/presence-sampler.js";
import type { ServerEnv } from "../src/env.js";

function lanyardStub(activities: unknown[]) {
  return () =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { activities } }),
    } as Response);
}

const envWith = (id: string): ServerEnv =>
  ({ discordUserId: id }) as ServerEnv;

test("a category not on the record list is never written", async () => {
  const store = openStore(":memory:");
  // Owner records games but NOT music.
  store.content.setPresence({ show: ["game", "music"], sample: ["game"], retentionDays: null, hiddenGames: [] });

  const start = Date.UTC(2026, 6, 17, 20, 0);
  const orig = globalThis.fetch;
  globalThis.fetch = lanyardStub([
    { type: 0, name: "Factorio", timestamps: { start } },
    {
      type: 2,
      name: "Spotify",
      details: "Vampire",
      state: "Olivia Rodrigo",
      sync_id: "track-vampire",
      timestamps: { start },
    },
  ]) as typeof fetch;

  try {
    const sampler = new PresenceSampler(envWith("123"), store, "*/5 * * * *", () => {});
    const recorded = await sampler.sample(new Date(start + 30 * 60000));
    assert.equal(recorded, 1, "only the game was recorded, music was skipped");
  } finally {
    globalThis.fetch = orig;
  }

  const since = new Date(Date.UTC(2026, 6, 1)).toISOString();
  const games = store.sessions.playtime("game", since);
  assert.deepEqual(games.map((g) => g.name), ["Factorio"]);
  // music wasn't on the sample list → its own table is empty too
  assert.deepEqual(store.music.topSongs(since, 10), [], "music not sampled, nothing landed");
});

test("enabling music sampling records the full track to music_plays", async () => {
  const store = openStore(":memory:");
  store.content.setPresence({ show: ["game"], sample: ["game", "music"], retentionDays: null, hiddenGames: [] });

  const start = Date.UTC(2026, 6, 17, 20, 0);
  const orig = globalThis.fetch;
  // The real payload shape: multi-artist state, song in details, album in assets.
  globalThis.fetch = lanyardStub([
    {
      type: 2,
      name: "Spotify",
      details: "I Love It (feat. Charli XCX)",
      state: "Icona Pop; Charli xcx",
      sync_id: "12zpU2S4lMdrK9dvsOoL1m",
      assets: { large_text: "THIS IS... ICONA POP" },
      timestamps: { start },
    },
  ]) as typeof fetch;

  try {
    const sampler = new PresenceSampler(envWith("123"), store, "*/5 * * * *", () => {});
    await sampler.sample(new Date(start + 3 * 60000));
  } finally {
    globalThis.fetch = orig;
  }

  const since = new Date(Date.UTC(2026, 6, 1)).toISOString();
  const songs = store.music.topSongs(since, 10);
  assert.deepEqual(songs.map((s) => s.name), ["I Love It (feat. Charli XCX)"]);
  // and the multi-artist string split into two rankable artists
  const artists = store.music.topArtists(since, 10).map((a) => a.name).sort();
  assert.deepEqual(artists, ["Charli xcx", "Icona Pop"]);
  const albums = store.music.topAlbums(since, 10);
  assert.deepEqual(albums.map((a) => a.name), ["THIS IS... ICONA POP"]);
  // NOT in the session table — music has its own home now
  assert.deepEqual(store.sessions.playtime("music", since), []);
});

test("prune honours the CMS retention setting", () => {
  const store = openStore(":memory:");
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  store.sessions.observe({ category: "game", name: "Old", startedAt: daysAgo(400), seenAt: daysAgo(400), startedExact: true });

  const sampler = new PresenceSampler(envWith("123"), store, "*/5 * * * *", () => {});

  // forever → nothing pruned
  store.content.setPresence({ show: ["game"], sample: ["game"], retentionDays: null, hiddenGames: [] });
  assert.equal(sampler.prune(), 0, "retention=forever prunes nothing");

  // 1 year → the 400-day session goes
  store.content.setPresence({ show: ["game"], sample: ["game"], retentionDays: 365, hiddenGames: [] });
  assert.equal(sampler.prune(), 1, "retention=365 prunes the old session");
});
