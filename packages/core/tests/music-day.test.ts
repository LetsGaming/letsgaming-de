import test from "node:test";
import assert from "node:assert/strict";
import { dayRowsFor, type MusicDayTrack } from "../src/music-day.js";

// Two tracks: a collaboration "X; Y" and a solo "X". X therefore appears on both,
// Y on only the first. This is the exact shape the "different artists" drill has to
// collapse correctly. Lives in core now because the server runs this and caps the
// result before sending — the aggregation can't be the client's private business.
const tracks: MusicDayTrack[] = [
  { song: "Alpha", artist: "X; Y", minutes: 10, plays: 2, artUrl: "u" },
  { song: "Beta", artist: "X", minutes: 5, plays: 1 },
];

test("dayRowsFor: songs mode returns each track as its own row, artist as subtitle", () => {
  const rows = dayRowsFor(tracks, "songs");
  assert.deepEqual(
    rows.map((r) => r.primary),
    ["Alpha", "Beta"],
  );
  assert.equal(rows[0]?.secondary, "X; Y");
});

test("dayRowsFor: artists mode aggregates by artist, splitting collaborations and summing", () => {
  const rows = dayRowsFor(tracks, "artists");
  // X = 10 + 5 = 15 min over 2 tracks; Y = 10 min from the collab only.
  assert.deepEqual(
    rows.map((r) => r.primary),
    ["X", "Y"],
  );
  assert.equal(rows.find((r) => r.primary === "X")?.minutes, 15);
  assert.equal(rows.find((r) => r.primary === "X")?.plays, 3);
  assert.equal(rows.find((r) => r.primary === "Y")?.minutes, 10);
});

test("dayRowsFor: artists mode never leaks song titles into the rows (regression guard)", () => {
  const primaries = dayRowsFor(tracks, "artists").map((r) => r.primary);
  assert.ok(!primaries.includes("Alpha"));
  assert.ok(!primaries.includes("Beta"));
});

test("dayRowsFor: an empty day is an empty list in either mode", () => {
  assert.deepEqual(dayRowsFor([], "songs"), []);
  assert.deepEqual(dayRowsFor([], "artists"), []);
});
