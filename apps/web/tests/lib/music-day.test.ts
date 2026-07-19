import { describe, expect, it } from "vitest";
import { dayRowsFor } from "../../src/lib/music-day";
import type { MusicDayTrack } from "@lg/core";

// Two tracks: a collaboration "X; Y" and a solo "X". X therefore appears on both,
// Y on only the first. This is the exact shape the "different artists" drill has
// to collapse correctly.
const tracks: MusicDayTrack[] = [
  { song: "Alpha", artist: "X; Y", minutes: 10, plays: 2, artUrl: "u" },
  { song: "Beta", artist: "X", minutes: 5, plays: 1 },
];

describe("dayRowsFor", () => {
  it("songs mode returns each track as its own row, artist kept as the subtitle", () => {
    const rows = dayRowsFor(tracks, "songs");
    expect(rows.map((r) => r.primary)).toEqual(["Alpha", "Beta"]);
    expect(rows[0]?.secondary).toBe("X; Y");
  });

  it("artists mode aggregates by artist, splitting collaborations and summing", () => {
    const rows = dayRowsFor(tracks, "artists");
    // X = 10 + 5 = 15 min over 2 tracks; Y = 10 min from the collab only.
    expect(rows.map((r) => r.primary)).toEqual(["X", "Y"]);
    expect(rows.find((r) => r.primary === "X")?.minutes).toBe(15);
    expect(rows.find((r) => r.primary === "X")?.plays).toBe(3);
    expect(rows.find((r) => r.primary === "Y")?.minutes).toBe(10);
  });

  it("artists mode NEVER leaks song titles into the rows (the regression guard)", () => {
    const primaries = dayRowsFor(tracks, "artists").map((r) => r.primary);
    expect(primaries).not.toContain("Alpha");
    expect(primaries).not.toContain("Beta");
  });

  it("an empty day is an empty list in either mode", () => {
    expect(dayRowsFor([], "songs")).toEqual([]);
    expect(dayRowsFor([], "artists")).toEqual([]);
  });
});
