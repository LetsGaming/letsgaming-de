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
const SINCE = new Date(Date.UTC(2026, 6, 1)).toISOString();

type TestStore = ReturnType<typeof openStore>;

const observe = (store: TestStore, name: string, start: string, seen: string, exact = true) =>
  store.sessions.observe({ category: "game", name, startedAt: start, seenAt: seen, startedExact: exact });

const entry = (store: TestStore, name: string) => store.sessions.playtime("game", SINCE).find((e) => e.name === name);

test("one game reported twice with different starts counts its time once", () => {
  const store = openStore(":memory:");
  // League of Legends: the game process (18:00) and the lobby (18:30) overlap.
  observe(store, "League of Legends", iso(18, 0), iso(19, 0));
  observe(store, "League of Legends", iso(18, 30), iso(19, 0));
  assert.equal(entry(store, "League of Legends")?.minutes, 60, "60 minutes, not 60 + 30");
  assert.equal(entry(store, "League of Legends")?.sessions, 1);
});

test("the later report arriving first is merged the same way", () => {
  const store = openStore(":memory:");
  observe(store, "League of Legends", iso(18, 30), iso(19, 0));
  observe(store, "League of Legends", iso(18, 0), iso(19, 0));
  assert.equal(entry(store, "League of Legends")?.minutes, 60);
  assert.equal(entry(store, "League of Legends")?.sessions, 1);
});

test("repeated polls of both reports keep growing one session", () => {
  const store = openStore(":memory:");
  for (const seen of [iso(19, 0), iso(19, 5), iso(19, 10)]) {
    observe(store, "League of Legends", iso(18, 0), seen);
    observe(store, "League of Legends", iso(18, 30), seen);
  }
  assert.equal(entry(store, "League of Legends")?.minutes, 70);
  assert.equal(entry(store, "League of Legends")?.sessions, 1);
});

test("separate evenings of the same game stay separate sessions", () => {
  const store = openStore(":memory:");
  observe(store, "Minecraft", iso(10, 0), iso(11, 0));
  observe(store, "Minecraft", iso(20, 0), iso(21, 0));
  assert.equal(entry(store, "Minecraft")?.minutes, 120);
  assert.equal(entry(store, "Minecraft")?.sessions, 2);
});

test("different games never merge, even when they overlap", () => {
  const store = openStore(":memory:");
  observe(store, "Game A", iso(18, 0), iso(19, 0));
  observe(store, "Game B", iso(18, 30), iso(19, 0));
  assert.equal(entry(store, "Game A")?.minutes, 60);
  assert.equal(entry(store, "Game B")?.minutes, 30);
});

test("migration 0020 merges the overlapping sessions already stored", () => {
  const before = mkdtempSync(join(tmpdir(), "lg-mig-"));
  for (const f of readdirSync(MIGRATIONS)) {
    if (/^\d+_.+\.sql$/.test(f) && Number(f.slice(0, 4)) <= 19) cpSync(join(MIGRATIONS, f), join(before, f));
  }
  const db = new DatabaseSync(":memory:");
  runMigrations(db, before);

  const insert = db.prepare(
    "INSERT INTO presence_sessions (category, name, started_at, last_seen_at, started_exact) VALUES (?, ?, ?, ?, ?)",
  );
  // League twice at once: 18:00-19:00 and 18:30-19:00.
  insert.run("game", "League of Legends", iso(18, 0), iso(19, 0), 1);
  insert.run("game", "League of Legends", iso(18, 30), iso(19, 0), 1);
  // A chain: 10:00-11:00, 10:45-12:00 and 11:50-12:30 form one run from 10:00 to 12:30.
  insert.run("game", "Chain", iso(10, 0), iso(11, 0), 1);
  insert.run("game", "Chain", iso(10, 45), iso(12, 0), 1);
  insert.run("game", "Chain", iso(11, 50), iso(12, 30), 0);
  // Two separate evenings stay separate.
  insert.run("game", "Minecraft", iso(10, 0), iso(11, 0), 1);
  insert.run("game", "Minecraft", iso(20, 0), iso(21, 0), 1);
  // The same name in another category is not the same activity.
  insert.run("streaming", "League of Legends", iso(18, 15), iso(18, 45), 1);

  const applied = runMigrations(db, MIGRATIONS);
  assert.ok(applied.length > 0, "the newer migrations ran");

  const rows = db
    .prepare(
      "SELECT category, name, started_at, last_seen_at, started_exact FROM presence_sessions ORDER BY category, name, started_at",
    )
    .all() as { category: string; name: string; started_at: string; last_seen_at: string; started_exact: number }[];
  const pick = (cat: string, name: string) => rows.filter((r) => r.category === cat && r.name === name);

  const league = pick("game", "League of Legends");
  assert.equal(league.length, 1);
  assert.deepEqual([league[0]?.started_at, league[0]?.last_seen_at], [iso(18, 0), iso(19, 0)]);

  const chain = pick("game", "Chain");
  assert.equal(chain.length, 1);
  assert.deepEqual([chain[0]?.started_at, chain[0]?.last_seen_at], [iso(10, 0), iso(12, 30)]);
  assert.equal(chain[0]?.started_exact, 0, "the weakest start wins");

  assert.equal(pick("game", "Minecraft").length, 2);
  assert.equal(pick("streaming", "League of Legends").length, 1);
});
