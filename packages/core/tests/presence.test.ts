import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultPresenceSettings, normalizePresence, sanitizePresenceShow, type LanyardData } from "../src/presence.js";

test("sanitizePresenceShow keeps valid categories, de-dupes, and drops junk", () => {
  assert.deepEqual(sanitizePresenceShow(["game", "game", "nope", "steam"]), ["game"]);
  assert.deepEqual(sanitizePresenceShow("nope"), []);
  assert.deepEqual(sanitizePresenceShow([1, {}, "music"]), ["music"]);
  assert.ok(defaultPresenceSettings().show.includes("game"));
});

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

test("custom status combines emoji + text", () => {
  const all = normalizePresence(data, ["game", "music", "streaming", "custom"]);
  const custom = all.cards.find((c) => c.category === "custom");
  assert.equal(custom?.title, "🛠️ building things");
});

test("empty allow-list yields no cards but keeps status", () => {
  const none = normalizePresence(data, []);
  assert.equal(none.cards.length, 0);
  assert.equal(none.status, "online");
});

test("hidden drops a matching activity from the live widget — not just games", () => {
  const shown: readonly ("game" | "streaming" | "music" | "custom")[] = ["game", "music", "streaming", "custom"];
  // Hide the game and the stream by name (case-insensitively); the rest stay.
  const view = normalizePresence(data, shown, ["counter-strike 2", "Streaming dev work"]);
  const cats = view.cards.map((c) => c.category);
  assert.ok(!cats.includes("game"), "hidden game is gone");
  assert.ok(!cats.includes("streaming"), "hidden stream is gone — hidden isn't games-only");
  assert.ok(cats.includes("music"), "unrelated music card survives");
  assert.ok(cats.includes("custom"), "unrelated custom card survives");
});

test("hidden matches the Spotify song and the custom-status text too", () => {
  const shown: readonly ("game" | "streaming" | "music" | "custom")[] = ["game", "music", "streaming", "custom"];
  const view = normalizePresence(data, shown, ["nightcall", "🛠️ building things"]);
  assert.ok(!view.cards.some((c) => c.category === "music"), "hidden song hides the Spotify card");
  assert.ok(!view.cards.some((c) => c.category === "custom"), "hidden custom text hides that card");
  assert.ok(view.cards.some((c) => c.category === "game"), "unrelated game survives");
});
