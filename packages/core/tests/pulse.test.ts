import assert from "node:assert/strict";
import test from "node:test";
import { buildPulse, PULSE_DAYS, type ResolveInput } from "../src/resolve.js";

const NOW = new Date("2026-11-18T12:00:00Z");

/** Only the fields `buildPulse` reads; the rest of `ResolveInput` is irrelevant here. */
const input = (extra: Partial<ResolveInput> & { commits?: { date: string; count: number }[] } = {}): ResolveInput => {
  const { commits, ...rest } = extra;
  return {
    content: {} as ResolveInput["content"],
    source: commits ? { github: { contributions: commits } as never } : {},
    nav: [],
    modules: [],
    ...rest,
  };
};

test("a strip covers 28 days, oldest first, ending today in the display zone", () => {
  const p = buildPulse(input({ commits: [{ date: "2026-11-18", count: 3 }] }), NOW);
  assert.ok(p);
  assert.equal(p.days.length, PULSE_DAYS);
  assert.equal(p.days.at(-1), "2026-11-18");
  assert.equal(p.days[0], "2026-10-22");
  assert.deepEqual([...p.days].sort(), p.days);
});

test("no activity from any source resolves to no strip, not a strip of empty cells", () => {
  assert.equal(buildPulse(input(), NOW), undefined);
  assert.equal(buildPulse(input({ commits: [{ date: "2026-11-18", count: 0 }] }), NOW), undefined);
});

test("one source alone is enough, and a day with activity is never level 0", () => {
  const p = buildPulse(input({ commits: [{ date: "2026-11-10", count: 1 }, { date: "2026-11-11", count: 40 }] }), NOW);
  assert.ok(p);
  const at = (d: string) => p.levels[p.days.indexOf(d)];
  assert.ok((at("2026-11-10") ?? 0) >= 1);
  assert.equal(at("2026-11-11"), 4);
  assert.equal(at("2026-11-12"), 0);
});

test("three sources merge: each is scaled to its own busiest day", () => {
  const p = buildPulse(
    input({
      commits: [{ date: "2026-11-05", count: 40 }],
      playHistory: { ledger: [{ day: "2026-11-06", minutes: 360 }], heat: [], timeZone: "Europe/Berlin" },
      pulse: { music: [{ day: "2026-11-07", minutes: 90 }], timeZone: "Europe/Berlin" },
    }),
    NOW,
  );
  assert.ok(p);
  const at = (d: string) => p.levels[p.days.indexOf(d)];
  assert.equal(at("2026-11-05"), 4);
  assert.equal(at("2026-11-06"), 4);
  assert.equal(at("2026-11-07"), 4);
  assert.deepEqual(p.counts[p.days.indexOf("2026-11-06")], { commits: 0, gameMinutes: 360, listenMinutes: 0 });
});

test("a day with activity in two sources outweighs a day with one", () => {
  const p = buildPulse(
    input({
      commits: [{ date: "2026-11-05", count: 10 }, { date: "2026-11-06", count: 10 }],
      pulse: { music: [{ day: "2026-11-06", minutes: 60 }], timeZone: "Europe/Berlin" },
    }),
    NOW,
  );
  assert.ok(p);
  assert.ok((p.levels[p.days.indexOf("2026-11-06")] ?? 0) > (p.levels[p.days.indexOf("2026-11-05")] ?? 0));
});

test("only today having activity makes the strip live", () => {
  const live = buildPulse(input({ commits: [{ date: "2026-11-18", count: 2 }] }), NOW);
  const quiet = buildPulse(input({ commits: [{ date: "2026-11-17", count: 2 }] }), NOW);
  assert.equal(live?.live, true);
  assert.equal(quiet?.live, false);
});

test("activity older than the span is ignored", () => {
  const p = buildPulse(input({ commits: [{ date: "2026-10-21", count: 9 }, { date: "2026-10-22", count: 9 }] }), NOW);
  assert.ok(p);
  assert.equal(p.levels[0], 4);
  assert.equal(p.counts.reduce((a, c) => a + c.commits, 0), 9);
});

test("today follows the display zone, not UTC", () => {
  const lateUtc = new Date("2026-11-18T23:30:00Z");
  const berlin = buildPulse(input({ commits: [{ date: "2026-11-19", count: 1 }], pulse: { music: [], timeZone: "Europe/Berlin" } }), lateUtc);
  const la = buildPulse(input({ commits: [{ date: "2026-11-18", count: 1 }], pulse: { music: [], timeZone: "America/Los_Angeles" } }), lateUtc);
  assert.equal(berlin?.days.at(-1), "2026-11-19");
  assert.equal(la?.days.at(-1), "2026-11-18");
});

test("a DST changeover neither skips nor repeats a day", () => {
  const p = buildPulse(
    input({ commits: [{ date: "2026-03-29", count: 1 }], pulse: { music: [], timeZone: "Europe/Berlin" } }),
    new Date("2026-03-30T10:00:00Z"),
  );
  assert.ok(p);
  assert.equal(new Set(p.days).size, PULSE_DAYS);
  for (let i = 1; i < p.days.length; i++) {
    const gap = (Date.parse(`${p.days[i]}T00:00:00Z`) - Date.parse(`${p.days[i - 1]}T00:00:00Z`)) / 86_400_000;
    assert.equal(gap, 1);
  }
  assert.equal(p.days.at(-1), "2026-03-30");
});
