import assert from "node:assert/strict";
import { test } from "node:test";
import { playtimeRows } from "../src/presence.js";

// ── observed playtime, shaped into chart rows ────────────────────────────────
// Playtime is entirely Lanyard-observed now (Steam was dropped): the sampler
// records every game Discord reports, and `playtimeRows` turns those per-game
// totals into rows, most-played first. The per-day ledger is a db concern
// (sessions `dailyTotals`), tested there.

test("playtimeRows shapes observed entries into rows, most-played first", () => {
  const rows = playtimeRows([
    { name: "Minecraft", minutes: 180, sessions: 3, exact: true },
    { name: "Balatro", minutes: 400, sessions: 2, exact: true },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.name, r.minutes]),
    [
      ["Balatro", 400],
      ["Minecraft", 180],
    ],
  );
});

test("an inexact total stays flagged", () => {
  // A session Discord didn't date is timed from first sight, so it's a floor. The
  // flag has to survive or the chart shows a lower bound as a measurement.
  const rows = playtimeRows([{ name: "Balatro", minutes: 30, sessions: 1, exact: false }]);
  assert.equal(rows[0]?.exact, false);
});

test("ties break by name so the order is stable", () => {
  const rows = playtimeRows([
    { name: "Zeta", minutes: 100, sessions: 1, exact: true },
    { name: "Alpha", minutes: 100, sessions: 1, exact: true },
  ]);
  assert.deepEqual(rows.map((r) => r.name), ["Alpha", "Zeta"]);
});

test("nothing observed is an empty list, not a throw", () => {
  assert.deepEqual(playtimeRows([]), []);
});

test("playtimeRows attaches cached cover art and genre by name", () => {
  const meta = new Map([["balatro", { coverUrl: "https://media.rawg.io/b.jpg", genre: "Card" }]]);
  const rows = playtimeRows(
    [
      { name: "Balatro", minutes: 400, sessions: 2, exact: true },
      { name: "Some Indie", minutes: 60, sessions: 1, exact: true },
    ],
    meta,
  );
  const balatro = rows.find((r) => r.name === "Balatro");
  assert.equal(balatro?.coverUrl, "https://media.rawg.io/b.jpg");
  assert.equal(balatro?.genre, "Card");
  // a game with no cached metadata just has no cover/genre — not an error
  const indie = rows.find((r) => r.name === "Some Indie");
  assert.equal(indie?.coverUrl, undefined);
  assert.equal(indie?.genre, undefined);
});

test("playtimeRows matches metadata regardless of the casing Discord sent", () => {
  const meta = new Map([["hades ii", { genre: "Roguelike" }]]);
  const rows = playtimeRows([{ name: "  Hades II ", minutes: 90, sessions: 1, exact: true }], meta);
  assert.equal(rows[0]?.genre, "Roguelike");
});

// ── settings sanitizers (the CMS management layer) ───────────────────────────
import {
  sanitizeHiddenGames,
  sanitizePresenceSettings,
  sanitizeRetentionDays,
  isHiddenGame,
  defaultPresenceSettings,
} from "../src/presence.js";

test("retention coerces to the allowed set, never arbitrary", () => {
  assert.equal(sanitizeRetentionDays(365), 365);
  assert.equal(sanitizeRetentionDays(730), 730);
  assert.equal(sanitizeRetentionDays(null), null);
  // a fat-fingered "1" would prune almost everything — rejected to forever
  assert.equal(sanitizeRetentionDays(1), null);
  assert.equal(sanitizeRetentionDays("730"), null); // wrong type
});

test("hidden games are trimmed, de-duped case-insensitively, capped", () => {
  assert.deepEqual(sanitizeHiddenGames(["  Doom ", "doom", "Quake"]), ["Doom", "Quake"]);
  assert.deepEqual(sanitizeHiddenGames("not an array"), []);
  assert.deepEqual(sanitizeHiddenGames([1, "", "  ", "Real"]), ["Real"]);
  assert.equal(sanitizeHiddenGames(Array(300).fill("x").map((_, i) => `g${i}`)).length, 200);
});

test("isHiddenGame matches regardless of case and padding", () => {
  assert.equal(isHiddenGame("Counter-Strike 2", ["counter-strike 2"]), true);
  assert.equal(isHiddenGame("  DOOM ", ["doom"]), true);
  assert.equal(isHiddenGame("Factorio", ["Doom"]), false);
});

test("a partial settings body fills omitted fields from the default", () => {
  const d = defaultPresenceSettings();
  // older UI sends only `show`
  const out = sanitizePresenceSettings({ show: ["game"] });
  assert.deepEqual(out.show, ["game"]);
  assert.deepEqual(out.sample, d.sample); // filled, not dropped
  assert.equal(out.retentionDays, d.retentionDays);
  assert.deepEqual(out.hiddenGames, d.hiddenGames);
});

test("garbage settings sanitize to a valid object, never throw", () => {
  const out = sanitizePresenceSettings("nonsense");
  assert.ok(Array.isArray(out.show) && Array.isArray(out.sample));
  assert.ok(Array.isArray(out.hiddenGames));
});
