import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePlaytime } from "../src/presence.js";

// ── Steam and Discord measure the same hours ─────────────────────────────────

test("a game Steam knows is counted once, by Steam", () => {
  // Discord reports Steam games too — it detects them. Summing the two halves
  // double-counts every hour Steam already reported, which is the whole trap in
  // "just add Discord playtime".
  const merged = mergePlaytime(
    [{ name: "Counter-Strike 2", minutes2Weeks: 620 }],
    [{ name: "Counter-Strike 2", minutes: 300, sessions: 4, exact: true }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.minutes, 620);
  assert.equal(merged[0]?.source, "steam");
});

test("Steam wins even when it reports fewer minutes than we observed", () => {
  // Not max(). They're different measurements, and picking the bigger number is
  // still a guess about which one you're holding. Steam's is a fortnight of
  // everything; ours is what Discord watched. Where both exist, Steam's is the
  // one that means what the chart says.
  const merged = mergePlaytime(
    [{ name: "Factorio", minutes2Weeks: 60 }],
    [{ name: "Factorio", minutes: 400, sessions: 2, exact: true }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.minutes, 60);
  assert.equal(merged[0]?.source, "steam");
});

test("a game Steam has never heard of is the point of the exercise", () => {
  const merged = mergePlaytime(
    [{ name: "Counter-Strike 2", minutes2Weeks: 620 }],
    [{ name: "Minecraft", minutes: 180, sessions: 3, exact: true }],
  );
  assert.deepEqual(
    merged.map((m) => [m.name, m.minutes, m.source]),
    [
      ["Counter-Strike 2", 620, "steam"],
      ["Minecraft", 180, "observed"],
    ],
  );
});

test("matching survives the casing and spacing Discord actually sends", () => {
  const merged = mergePlaytime(
    [{ name: "Hades II", minutes2Weeks: 145 }],
    [{ name: "  hades II ", minutes: 90, sessions: 1, exact: true }],
  );
  assert.equal(merged.length, 1, "should have matched, not added a second row");
  assert.equal(merged[0]?.source, "steam");
});

test("an inexact total stays flagged through the merge", () => {
  // A session Discord didn't date is timed from first sight, so it's a floor. The
  // flag has to survive or the chart shows a lower bound as a measurement.
  const merged = mergePlaytime([], [{ name: "Balatro", minutes: 30, sessions: 1, exact: false }]);
  assert.equal(merged[0]?.exact, false);
});

test("Steam alone still works — nothing observed is not an error", () => {
  const merged = mergePlaytime([{ name: "Factorio", minutes2Weeks: 310 }], []);
  assert.deepEqual(merged.map((m) => m.source), ["steam"]);
});

// ── the all-time ledger differ (feature 02) ──────────────────────────────────
import { differenceLedger, type SteamSnapshot } from "../src/presence.js";

const snap = (syncedAt: string, games: [string, number, number][]): SteamSnapshot => ({
  syncedAt,
  games: games.map(([name, appId, minutesForever]) => ({ name, appId, minutesForever })),
});

test("differencing lifetime counters gives exact minutes played", () => {
  const days = differenceLedger([
    snap("2026-07-15T20:00:00Z", [["Factorio", 1, 1000]]),
    snap("2026-07-16T20:00:00Z", [["Factorio", 1, 1090]]), // +90
    snap("2026-07-17T20:00:00Z", [["Factorio", 1, 1150]]), // +60
  ]);
  assert.deepEqual(days, [
    { day: "2026-07-16", minutes: 90 },
    { day: "2026-07-17", minutes: 60 },
  ]);
});

test("a game's first sighting credits nothing — only its baseline is seeded", () => {
  // The bug this prevents: crediting Counter-Strike's 74,000 lifetime minutes to
  // the first day it entered the recent list.
  const days = differenceLedger([
    snap("2026-07-15T20:00:00Z", [["CS2", 730, 74_000]]), // first sight: seed only
    snap("2026-07-16T20:00:00Z", [["CS2", 730, 74_120]]), // +120, real
  ]);
  assert.deepEqual(days, [{ day: "2026-07-16", minutes: 120 }]);
});

test("a backwards counter is noise, clamped, and re-baselined", () => {
  const days = differenceLedger([
    snap("2026-07-15T20:00:00Z", [["Hades", 3, 5000]]),
    snap("2026-07-16T20:00:00Z", [["Hades", 3, 4000]]), // reset: 0, not -1000
    snap("2026-07-17T20:00:00Z", [["Hades", 3, 4050]]), // +50 off the NEW baseline
  ]);
  assert.deepEqual(days, [{ day: "2026-07-17", minutes: 50 }]);
});

test("two games on one day sum into that day", () => {
  const days = differenceLedger([
    snap("2026-07-15T20:00:00Z", [["A", 1, 100], ["B", 2, 200]]),
    snap("2026-07-16T20:00:00Z", [["A", 1, 130], ["B", 2, 240]]), // +30 +40
  ]);
  assert.deepEqual(days, [{ day: "2026-07-16", minutes: 70 }]);
});

test("empty history is an empty ledger, not a throw", () => {
  assert.deepEqual(differenceLedger([]), []);
});
