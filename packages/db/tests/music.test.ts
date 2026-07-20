import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "../src/index.js";

const iso = (h: number, m = 0, s = 0) => new Date(Date.UTC(2026, 6, 17, h, m, s)).toISOString();

test("a track scrobbles once no matter how many polls catch it", () => {
  const store = openStore(":memory:");
  const play = {
    trackId: "12zpU2S4lMdrK9dvsOoL1m",
    song: "I Love It (feat. Charli XCX)",
    artist: "Icona Pop; Charli xcx",
    album: "THIS IS... ICONA POP",
    startedAt: iso(20, 0),
  };
  store.music.observe({ ...play, seenAt: iso(20, 1) });
  store.music.observe({ ...play, seenAt: iso(20, 2) }); // same track, later poll
  store.music.observe({ ...play, seenAt: iso(20, 3) });

  const songs = store.music.topSongs(iso(0), 1000);
  assert.equal(songs.length, 1, "one play, not three");
  assert.equal(songs[0]?.plays, 1);
  assert.equal(songs[0]?.minutes, 3, "20:00 → 20:03");
});

test("a collaboration counts toward every artist", () => {
  // The real payload: "Icona Pop; Charli xcx" is TWO artists in one field.
  const store = openStore(":memory:");
  store.music.observe({
    trackId: "t1", song: "I Love It", artist: "Icona Pop; Charli xcx",
    album: "THIS IS... ICONA POP", startedAt: iso(20, 0), seenAt: iso(20, 4),
  });
  const artists = store.music.topArtists(iso(0), 1000);
  const names = artists.map((a) => a.name).sort();
  assert.deepEqual(names, ["Charli xcx", "Icona Pop"], "split into two, not one joined string");
  assert.ok(artists.every((a) => a.minutes === 4), "each artist gets the full play duration");
  // one play with two artists: each artist gets one play (the composite PK on
  // music_play_artists guarantees an artist can't appear twice on a play).
  assert.ok(artists.every((a) => a.plays === 1), "one play, counted once per artist");
});

test("Charli XCX's solo plays merge with her collaborations, case-insensitively", () => {
  const store = openStore(":memory:");
  store.music.observe({ trackId: "t1", song: "I Love It", artist: "Icona Pop; Charli xcx", startedAt: iso(20, 0), seenAt: iso(20, 3) });
  store.music.observe({ trackId: "t2", song: "Von Dutch", artist: "Charli XCX", startedAt: iso(21, 0), seenAt: iso(21, 5) });
  const artists = store.music.topArtists(iso(0), 1000);
  const charli = artists.find((a) => a.name.toLowerCase() === "charli xcx");
  assert.equal(charli?.minutes, 8, "3 (feat) + 5 (solo), merged despite 'xcx' vs 'XCX'");
  assert.equal(charli?.plays, 2);
});

test("top albums exclude plays with no album", () => {
  const store = openStore(":memory:");
  store.music.observe({ trackId: "t1", song: "A", artist: "X", album: "Real Album", startedAt: iso(20, 0), seenAt: iso(20, 5) });
  store.music.observe({ trackId: "t2", song: "B", artist: "Y", startedAt: iso(21, 0), seenAt: iso(21, 5) }); // no album
  const albums = store.music.topAlbums(iso(0), 10);
  assert.deepEqual(albums.map((a) => a.name), ["Real Album"]);
});

test("a replay later is a new play and they sum", () => {
  const store = openStore(":memory:");
  const base = { trackId: "t1", song: "Von Dutch", artist: "Charli XCX", startedAt: iso(20, 0) };
  store.music.observe({ ...base, seenAt: iso(20, 3) });
  // same track, DIFFERENT start (played again at 22:00)
  store.music.observe({ trackId: "t1", song: "Von Dutch", artist: "Charli XCX", startedAt: iso(22, 0), seenAt: iso(22, 3) });
  const songs = store.music.topSongs(iso(0), 1000);
  assert.equal(songs[0]?.plays, 2, "two plays of one track");
  assert.equal(songs[0]?.minutes, 6);
});

test("music ledger is daily minutes, oldest first", () => {
  const store = openStore(":memory:");
  const day = (d: number, h: number) => new Date(Date.UTC(2026, 6, d, h)).toISOString();
  store.music.observe({ trackId: "t1", song: "A", artist: "X", startedAt: day(17, 20), seenAt: day(17, 20) + "" });
  store.music.observe({ trackId: "t2", song: "B", artist: "X", startedAt: day(17, 21), seenAt: new Date(Date.UTC(2026,6,17,21,10)).toISOString() });
  store.music.observe({ trackId: "t3", song: "C", artist: "X", startedAt: day(19, 10), seenAt: new Date(Date.UTC(2026,6,19,10,5)).toISOString() });
  const days = store.music.dailyTotals(day(1, 0), "UTC");
  assert.deepEqual(days.map((d) => d.day), ["2026-07-17", "2026-07-19"]);
});

test("pruning a play cascades to its artist rows", () => {
  const store = openStore(":memory:");
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  store.music.observe({ trackId: "old", song: "A", artist: "Icona Pop; Charli xcx", startedAt: daysAgo(400), seenAt: daysAgo(400) });
  const removed = store.music.prune(daysAgo(365));
  assert.equal(removed, 1);
  // artist rows gone too (cascade) → top artists is empty
  assert.deepEqual(store.music.topArtists(daysAgo(700), 1000), []);
});

// ── album art (feature: serve covers like game icons) ────────────────────────

test("top songs carry the album art url when a play recorded one", () => {
  const store = openStore(":memory:");
  store.music.observe({
    trackId: "t1", song: "Von Dutch", artist: "Charli xcx", album: "Brat",
    albumArtUrl: "https://i.scdn.co/image/abc", startedAt: iso(20, 0), seenAt: iso(20, 5),
  });
  const songs = store.music.topSongs(iso(0), 1000);
  assert.equal(songs[0]?.artUrl, "https://i.scdn.co/image/abc");
});

test("a play with no art leaves artUrl undefined (row falls back to a monogram)", () => {
  const store = openStore(":memory:");
  store.music.observe({ trackId: "t1", song: "A", artist: "X", startedAt: iso(20, 0), seenAt: iso(20, 5) });
  const songs = store.music.topSongs(iso(0), 1000);
  assert.equal(songs[0]?.artUrl, undefined, "no art column value → no artUrl key");
});

test("art backfills: an earlier play with no art gets it from a later poll", () => {
  const store = openStore(":memory:");
  const base = { trackId: "t1", song: "A", artist: "X", startedAt: iso(20, 0) };
  store.music.observe({ ...base, seenAt: iso(20, 2) }); // no art yet
  store.music.observe({ ...base, albumArtUrl: "https://i.scdn.co/image/late", seenAt: iso(20, 4) });
  const songs = store.music.topSongs(iso(0), 1000);
  assert.equal(songs[0]?.artUrl, "https://i.scdn.co/image/late", "COALESCE backfilled the art");
});

test("an artist borrows the cover of their most-played track", () => {
  const store = openStore(":memory:");
  // Charli's short track has art A; her long track has art B. B should win.
  store.music.observe({
    trackId: "short", song: "Short", artist: "Charli xcx", albumArtUrl: "https://i.scdn.co/image/A",
    startedAt: iso(20, 0), seenAt: iso(20, 2),
  });
  store.music.observe({
    trackId: "long", song: "Long", artist: "Charli xcx", albumArtUrl: "https://i.scdn.co/image/B",
    startedAt: iso(21, 0), seenAt: iso(21, 9),
  });
  const artists = store.music.topArtists(iso(0), 1000);
  const charli = artists.find((a) => a.name.toLowerCase() === "charli xcx");
  assert.equal(charli?.artUrl, "https://i.scdn.co/image/B", "most-listened track's cover, not the first");
});

// ── the clickable stats ──────────────────────────────────────────────────────

test("distinctTracks counts tracks, not plays", () => {
  const store = openStore(":memory:");
  const t1 = { trackId: "t1", song: "A", artist: "X", startedAt: iso(20, 0) };
  store.music.observe({ ...t1, seenAt: iso(20, 3) });
  store.music.observe({ trackId: "t1", song: "A", artist: "X", startedAt: iso(22, 0), seenAt: iso(22, 3) }); // replay of same track
  store.music.observe({ trackId: "t2", song: "B", artist: "Y", startedAt: iso(21, 0), seenAt: iso(21, 3) });
  assert.equal(store.music.distinctTracks(iso(0)), 2, "two distinct tracks despite three plays");
});

test("distinctArtists counts split artist keys", () => {
  const store = openStore(":memory:");
  store.music.observe({ trackId: "t1", song: "A", artist: "Icona Pop; Charli xcx", startedAt: iso(20, 0), seenAt: iso(20, 5) });
  store.music.observe({ trackId: "t2", song: "B", artist: "Charli XCX", startedAt: iso(21, 0), seenAt: iso(21, 5) });
  // Icona Pop + Charli xcx (merged across casing) = 2
  assert.equal(store.music.distinctArtists(iso(0)), 2);
});

// ── the day drill-in ─────────────────────────────────────────────────────────

test("dayBreakdown returns a date's tracks, most-listened first, with art", () => {
  const store = openStore(":memory:");
  store.music.observe({
    trackId: "t1", song: "Short", artist: "X", albumArtUrl: "https://i.scdn.co/image/s",
    startedAt: iso(9, 0), seenAt: iso(9, 2),
  });
  store.music.observe({
    trackId: "t2", song: "Long", artist: "Y", albumArtUrl: "https://i.scdn.co/image/l",
    startedAt: iso(10, 0), seenAt: iso(10, 8),
  });
  const day = store.music.dayBreakdown("2026-07-17", "UTC");
  assert.equal(day.length, 2);
  assert.equal(day[0]?.song, "Long", "longer listen ranks first");
  assert.equal(day[0]?.artUrl, "https://i.scdn.co/image/l");
  assert.equal(day[1]?.song, "Short");
});

test("dayBreakdown groups replays of one track within the day", () => {
  const store = openStore(":memory:");
  store.music.observe({ trackId: "t1", song: "A", artist: "X", startedAt: iso(9, 0), seenAt: iso(9, 3) });
  store.music.observe({ trackId: "t1", song: "A", artist: "X", startedAt: iso(14, 0), seenAt: iso(14, 2) }); // replay
  const day = store.music.dayBreakdown("2026-07-17", "UTC");
  assert.equal(day.length, 1, "one row for the track");
  assert.equal(day[0]?.plays, 2, "two plays summed");
  assert.equal(day[0]?.minutes, 5, "3 + 2 minutes");
});

test("dayBreakdown for a silent day is empty", () => {
  const store = openStore(":memory:");
  store.music.observe({ trackId: "t1", song: "A", artist: "X", startedAt: iso(9, 0), seenAt: iso(9, 3) });
  assert.deepEqual(store.music.dayBreakdown("2020-01-01", "UTC"), []);
});

// ── list ↔ count consistency (no sub-minute floor, no cap) ────────────────────

test("a sub-minute play still appears in topSongs and matches distinctTracks", () => {
  // The bug this guards: the aggregate list used to drop plays under a minute
  // while the day breakdown kept them, so a track you clearly played was missing
  // from "tracks played" but present when you drilled into its day. Now the list
  // reconciles with the count and with the day view.
  const store = openStore(":memory:");
  store.music.observe({ trackId: "brief", song: "Skipped", artist: "X", startedAt: iso(9, 0, 0), seenAt: iso(9, 0, 30) }); // 30s
  store.music.observe({ trackId: "full", song: "Played", artist: "Y", startedAt: iso(10, 0), seenAt: iso(10, 5) }); // 5m

  const songs = store.music.topSongs(iso(0), 1000);
  assert.equal(songs.length, 2, "the 30-second play is not filtered out");
  assert.equal(songs.length, store.music.distinctTracks(iso(0)), "list length matches the 'tracks played' count");
  // The brief play sorts last (ordered by duration), not hidden.
  assert.equal(songs[0]?.name, "Played");
  assert.equal(songs[1]?.name, "Skipped");
  // And it's exactly the same track set the day breakdown shows.
  assert.equal(store.music.dayBreakdown("2026-07-17", "UTC").length, 2);
});

test("topArtists reconciles with distinctArtists (no floor drops a brief artist)", () => {
  const store = openStore(":memory:");
  store.music.observe({ trackId: "b", song: "Brief", artist: "Fleeting", startedAt: iso(9, 0, 0), seenAt: iso(9, 0, 20) }); // 20s
  store.music.observe({ trackId: "f", song: "Full", artist: "Regular", startedAt: iso(10, 0), seenAt: iso(10, 6) });
  assert.equal(store.music.topArtists(iso(0), 1000).length, store.music.distinctArtists(iso(0)));
});

test("the list limit caps rows but not the distinct counts", () => {
  const store = openStore(":memory:");
  // Five distinct tracks by five distinct artists.
  for (let i = 0; i < 5; i++) {
    store.music.observe({
      trackId: `t${i}`,
      song: `Song ${i}`,
      artist: `Artist ${i}`,
      startedAt: iso(10 + i, 0),
      seenAt: iso(10 + i, 3),
    });
  }
  // The list obeys the cap...
  assert.equal(store.music.topSongs(iso(0), 2).length, 2, "topSongs respects the limit");
  assert.equal(store.music.topArtists(iso(0), 2).length, 2, "topArtists respects the limit");
  // ...while the headline counts stay the true totals, uncapped.
  assert.equal(store.music.distinctTracks(iso(0)), 5, "the count is the true total, not the capped list length");
  assert.equal(store.music.distinctArtists(iso(0)), 5);
});
