import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { runMigrations } from "../src/migrate.js";
import { openStore } from "../src/index.js";

const MIGRATIONS = fileURLToPath(new URL("../src/migrations/", import.meta.url));
const iso = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 17, h, m)).toISOString();

test("migration 0015 reclassifies exactly the artist-less plays and nothing else", () => {
  // Apply everything up to 0014, seed legacy rows, then apply the rest.
  const before = mkdtempSync(join(tmpdir(), "lg-mig-"));
  for (const f of readdirSync(MIGRATIONS)) {
    if (/^\d+_.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 14) cpSync(join(MIGRATIONS, f), join(before, f));
  }
  const db = new DatabaseSync(":memory:");
  runMigrations(db, before);

  const insert = db.prepare(
    "INSERT INTO music_plays (track_id, song, artist, album, started_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  insert.run("t1", "Song A", "Artist A", "Album A", iso(10), iso(10, 4)); // 4 min
  insert.run("t2", "Song B", "Artist B; Artist C", "Album B", iso(11), iso(11, 3)); // 3 min
  insert.run("e1", "Episode 1", "", "A Show", iso(12), iso(12, 30)); // 30 min
  insert.run("e2", "Episode 2", "  ", "A Show", iso(13), iso(13, 20)); // 20 min

  const seconds = (where: string) =>
    Number(
      (
        db
          .prepare(
            `SELECT COALESCE(SUM(strftime('%s', last_seen_at) - strftime('%s', started_at)), 0) AS s FROM music_plays ${where}`,
          )
          .get() as { s: number }
      ).s,
    );
  const totalBefore = seconds("");
  assert.equal(totalBefore, (4 + 3 + 30 + 20) * 60);

  const applied = runMigrations(db, MIGRATIONS).map((m) => m.version);
  assert.ok(applied.includes(15));

  const episodes = seconds("WHERE kind = 'episode'");
  const tracks = seconds("WHERE kind = 'track'");
  assert.equal(episodes, (30 + 20) * 60, "only the artist-less plays were reclassified");
  assert.equal(tracks, (4 + 3) * 60);
  assert.equal(totalBefore - tracks, episodes, "music total drops by exactly the reclassified records");
  db.close();
});

test("episodes are recorded but excluded from every music aggregate", () => {
  const store = openStore(":memory:");
  const track = { trackId: "t1", song: "Song", artist: "Someone", album: "LP", startedAt: iso(10), seenAt: iso(10, 5) };
  const episode = { trackId: "e1", song: "Ep", artist: "", album: "Show", kind: "episode" as const, startedAt: iso(11), seenAt: iso(11, 40) };
  store.music.observe(track);
  store.music.observe(episode);

  const since = iso(0);
  assert.deepEqual(store.music.topSongs(since, 10).map((s) => s.name), ["Song"]);
  assert.deepEqual(store.music.topArtists(since, 10).map((a) => a.name), ["Someone"]);
  assert.deepEqual(store.music.topAlbums(since, 10).map((a) => a.name), ["LP"]);
  assert.equal(store.music.distinctTracks(since), 1);
  assert.equal(store.music.distinctArtists(since), 1);
  assert.equal(store.music.totalMinutes(since), 5);
  assert.equal(store.music.dailyTotals(since, "UTC").reduce((n, d) => n + d.minutes, 0), 5);
  assert.deepEqual(store.music.dayBreakdown("2026-07-17", "UTC").map((t) => t.song), ["Song"]);

  const from = iso(0);
  const to = new Date(Date.UTC(2026, 6, 18)).toISOString();
  assert.equal(store.wrapped.minutesListened(from, to), 5);
  assert.deepEqual(store.wrapped.topSongs(from, to, 10).map((s) => s.name), ["Song"]);
  assert.deepEqual(store.wrapped.topArtists(from, to, 10).map((a) => a.name), ["Someone"]);
});

test("a recorded Discord application image is served as the cover and retried after a miss", () => {
  const store = openStore(":memory:");
  store.gameMeta.noteApplication("Minecraft", "1402418491272986635");
  const week = new Date(Date.UTC(2026, 6, 20)).toISOString();
  assert.equal(store.gameMeta.pendingImages(week).length, 1);

  store.gameMeta.putImage("Minecraft", null, iso(1));
  assert.equal(store.gameMeta.pendingImages(iso(0)).length, 0, "a fresh miss is not retried yet");
  assert.equal(store.gameMeta.pendingImages(week).length, 1, "retried once the window has passed");

  const url = "https://cdn.discordapp.com/app-icons/1402418491272986635/abc.png";
  store.gameMeta.putImage("Minecraft", url, iso(2));
  assert.equal(store.gameMeta.getAll().get("minecraft")?.coverUrl, url);
  assert.equal(store.gameMeta.pendingImages(week).length, 0);

  store.gameMeta.put("Minecraft", { coverUrl: "https://media.rawg.io/m.jpg" });
  assert.equal(store.gameMeta.getAll().get("minecraft")?.coverUrl, "https://media.rawg.io/m.jpg", "a stored RAWG cover wins");
});
