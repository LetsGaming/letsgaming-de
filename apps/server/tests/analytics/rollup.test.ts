import assert from "node:assert/strict";
import { test } from "node:test";
import { hourBucket, openStore, type HourlyHit } from "@lg/db";
import { catchUp, rollupAll, rollupDays, rollupRange, runDailyRollup, runHourlyRollup } from "../../src/analytics/rollup.js";

const hit = (bucket: string, dimension: HourlyHit["dimension"], key: string, n = 1): HourlyHit[] =>
  Array.from({ length: n }, () => ({ bucket, dimension, key }));

const NOW = new Date("2026-10-28T13:20:00Z");

function seeded() {
  const store = openStore(":memory:");
  store.analytics.recordHourly([
    ...hit("2026-10-26T09", "path", "/", 3),
    ...hit("2026-10-27T09", "path", "/", 4),
    ...hit("2026-10-27T09", "viewport", "desktop", 2),
    ...hit("2026-10-28T12", "path", "/work", 5),
    ...hit("2026-10-28T13", "path", "/work", 1),
  ]);
  return store;
}

const dayPageviews = (store: ReturnType<typeof openStore>, from: string, to: string) =>
  [...store.analytics.summaryByBucket("day", from, to)].map(([b, s]) => [b, s.pageviews]);

test("catch-up materializes every day and hour and sets through to the open bucket", () => {
  const store = seeded();
  const r = catchUp(store, NOW);
  assert.ok(r.day >= 3 && r.hour >= 1);
  assert.equal(store.analytics.getRollupState("day")?.through, "2026-10-28");
  assert.equal(store.analytics.getRollupState("hour")?.through, "2026-10-28T13");
  assert.deepEqual(dayPageviews(store, "2026-10-26", "2026-10-28"), [
    ["2026-10-26", 3],
    ["2026-10-27", 4],
    ["2026-10-28", 6],
  ]);
});

test("running the jobs again changes nothing", () => {
  const store = seeded();
  catchUp(store, NOW);
  const before = JSON.stringify([...store.analytics.summaryByBucket("day", "2026-10-01", "2026-10-31")]);
  runHourlyRollup(store, NOW);
  runDailyRollup(store, NOW);
  catchUp(store, NOW);
  rollupAll(store, NOW);
  assert.equal(JSON.stringify([...store.analytics.summaryByBucket("day", "2026-10-01", "2026-10-31")]), before);
});

test("the open day is topped up live after the job ran", () => {
  const store = seeded();
  catchUp(store, NOW);
  store.analytics.recordHourly(hit("2026-10-28T13", "path", "/work", 10));
  assert.deepEqual(dayPageviews(store, "2026-10-28", "2026-10-28"), [["2026-10-28", 16]]);
});

test("a backfill of a middle slice does not move through", () => {
  const store = seeded();
  rollupDays(store, "2026-10-26", "2026-10-26", NOW);
  assert.equal(store.analytics.getRollupState("day"), null, "no initial pass yet, so nothing is trusted");
  assert.deepEqual(dayPageviews(store, "2026-10-26", "2026-10-28"), [
    ["2026-10-26", 3],
    ["2026-10-27", 4],
    ["2026-10-28", 6],
  ]);
});

test("a recomputed range picks up rows that arrived late", () => {
  const store = seeded();
  catchUp(store, NOW);
  store.analytics.recordHourly(hit("2026-10-26T09", "path", "/", 7));
  assert.equal(dayPageviews(store, "2026-10-26", "2026-10-26")[0]?.[1], 3, "stale until recomputed");
  rollupRange(store, "day", "2026-10-26", "2026-10-26", { now: NOW });
  assert.equal(dayPageviews(store, "2026-10-26", "2026-10-26")[0]?.[1], 10);
});

test("rollupAll on an empty store is a no-op", () => {
  assert.deepEqual(rollupAll(openStore(":memory:"), NOW), { hour: 0, day: 0 });
  assert.equal(hourBucket(NOW.getTime()), "2026-10-28T13");
});
