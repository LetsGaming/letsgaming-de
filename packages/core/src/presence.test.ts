import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePresence, type LanyardData } from "./presence.js";

const data: LanyardData = {
  discord_status: "online",
  listening_to_spotify: true,
  spotify: { song: "Nightcall", artist: "Kavinsky", album: "OutRun", album_art_url: "http://art" },
  activities: [
    { type: 0, name: "Counter-Strike 2", details: "Competitive", state: "Mirage", application_id: "730" },
    { type: 2, name: "Spotify" }, // duplicate of the spotify object — must be de-duped
    { type: 4, name: "Custom Status", state: "building things", emoji: { name: "🛠️" } },
    { type: 1, name: "Streaming dev work" },
  ],
};

test("only enabled categories are shown", () => {
  const gamesOnly = normalizePresence(data, ["game"]);
  assert.deepEqual(gamesOnly.cards.map((c) => c.category), ["game"]);
  assert.equal(gamesOnly.cards[0]?.title, "Counter-Strike 2");
  assert.equal(gamesOnly.status, "online");
});

test("music is a single de-duped Spotify card (not the activity too)", () => {
  const withMusic = normalizePresence(data, ["game", "music"]);
  const music = withMusic.cards.filter((c) => c.category === "music");
  assert.equal(music.length, 1);
  assert.equal(music[0]?.title, "Nightcall");
  assert.match(music[0]?.subtitle ?? "", /Kavinsky/);
});

test("disabling music hides Spotify entirely", () => {
  const noMusic = normalizePresence(data, ["game", "streaming", "custom"]);
  assert.ok(!noMusic.cards.some((c) => c.category === "music"));
  assert.ok(noMusic.cards.some((c) => c.category === "streaming"));
  assert.ok(noMusic.cards.some((c) => c.category === "custom"));
});

test("custom status combines emoji + text; steam is not a Lanyard card", () => {
  const all = normalizePresence(data, ["game", "music", "streaming", "custom", "steam"]);
  const custom = all.cards.find((c) => c.category === "custom");
  assert.equal(custom?.title, "🛠️ building things");
  // "steam" only gates the synced section; it never produces a Lanyard card.
  assert.ok(!all.cards.some((c) => (c.category as string) === "steam"));
});

test("empty allow-list yields no cards but keeps status", () => {
  const none = normalizePresence(data, []);
  assert.equal(none.cards.length, 0);
  assert.equal(none.status, "online");
});
