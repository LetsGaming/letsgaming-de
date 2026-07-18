import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import { sessionSubject } from "../src/sync/presence-sampler.js";
import type { LanyardActivity } from "@lg/core";

// A Spotify listen as Lanyard actually sends it: type 2, name is always
// "Spotify", the song is in `details`, and the artist — the thing worth
// charting — is in `state`.
const spotify = (song: string, artist: string, start?: number): LanyardActivity => ({
  type: 2,
  name: "Spotify",
  details: song,
  state: artist,
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

test("a music session's subject is the artist, never \"Spotify\"", () => {
  // This is the whole fix: keying on `name` recorded "Spotify" for every listen,
  // so "top artists" was one bar. The artist lives in `state`.
  const a = spotify("Vampire", "Olivia Rodrigo");
  assert.equal(a.name, "Spotify", "Lanyard really does name it Spotify");
  assert.equal(sessionSubject("music", a), "Olivia Rodrigo");
});

test("a listen with no artist is dropped, not stored as empty", () => {
  assert.equal(sessionSubject("music", { type: 2, name: "Spotify" }), null);
});

test("streaming and watching keep their raw name for now", () => {
  assert.equal(sessionSubject("streaming", game("Just Chatting")), "Just Chatting");
  assert.equal(sessionSubject("watching", { type: 3, name: "YouTube" }), "YouTube");
});

// ── it lands as artist-keyed rows the chart can group ────────────────────────

test("listening time accumulates per artist through the store", () => {
  const store = openStore(":memory:");
  const t = (h: number, m = 0) => Date.UTC(2026, 6, 17, h, m);

  // Two songs by one artist, one by another — each song its own dated session.
  for (const [song, artist, start, end] of [
    ["Vampire", "Olivia Rodrigo", t(20, 0), t(20, 4)],
    ["Bad Idea", "Olivia Rodrigo", t(20, 4), t(20, 7)],
    ["Flowers", "Miley Cyrus", t(20, 7), t(20, 11)],
  ] as const) {
    const subject = sessionSubject("music", spotify(song, artist, start));
    assert.ok(subject);
    store.sessions.observe({
      category: "music",
      name: subject,
      startedAt: new Date(start).toISOString(),
      seenAt: new Date(end).toISOString(),
      startedExact: true,
    });
  }

  const artists = store.sessions.playtime("music", new Date(t(0)).toISOString());
  assert.deepEqual(
    artists.map((a) => [a.name, a.minutes]),
    [
      ["Olivia Rodrigo", 7], // 4 + 3
      ["Miley Cyrus", 4],
    ],
    "grouped by artist, most-listened first — the top-artists query, for free",
  );
});
