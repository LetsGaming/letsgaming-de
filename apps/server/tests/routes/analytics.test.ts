import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore, zonedParts } from "@lg/db";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/env.js";
import type { AnalyticsResponse } from "@lg/core";

const TOKEN = "c".repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };
const HOUR = 3600_000;
const isoHour = (d: Date) => d.toISOString().slice(0, 13);

async function appWithStore() {
  const store = openStore(":memory:");
  const env = loadEnv({ CMS_TOKEN: TOKEN, WEB_ORIGIN: "http://localhost:4321" });
  return { app: await buildApp(store, env), store };
}

/**
 * Seed one `tab` hit in every hour from `back` hours ago through now, then read
 * the dashboard.
 *
 * Seeding the whole span rather than only the requested window matters: the
 * truncation bug this file was written for dropped hours at the *edge* of the
 * window, so a fixture that stops at the edge leaves nothing for it to drop —
 * which is exactly how the first draft of this test passed against the bug.
 */
async function seededAnalytics(query: string, back: number) {
  const { app, store } = await appWithStore();
  const now = new Date();
  const hits = [];
  for (let h = back; h >= 0; h--) {
    hits.push({ bucket: isoHour(new Date(now.getTime() - h * HOUR)), dimension: "tab" as const, key: "home" });
  }
  store.analytics.recordHourly(hits);

  const res = await app.inject({ method: "GET", url: `/api/cms/analytics?${query}`, headers: auth });
  assert.equal(res.statusCode, 200);
  return { body: res.json() as AnalyticsResponse, now, store, app };
}

const perBucket = (body: AnalyticsResponse): Map<string, number> => {
  const m = new Map<string, number>();
  for (const r of body.chart.sections) m.set(r.bucket, (m.get(r.bucket) ?? 0) + r.count);
  return m;
};

/**
 * The original regression: day-unit ranges used an *hour* lower bound while
 * grouping by day, so every hour of the first day before the current hour-of-day
 * was filtered out — the oldest column was short by up to 23/24, and the client
 * drew it as a complete day regardless.
 */
test("a day-unit range includes the whole of its first day", async () => {
  const { body } = await seededAnalytics("hours=168&tz=UTC", 24 * 9);
  assert.equal(body.range.unit, "day");
  const buckets = perBucket(body);
  const first = [...buckets.keys()].sort()[0]!;
  assert.equal(buckets.get(first), 24, `first day (${first}) should be complete`);
});

test("day buckets are local days, and the range echoes the zone it used", async () => {
  const { body } = await seededAnalytics("hours=168&tz=Europe/Berlin", 24 * 9);
  assert.equal(body.range.timeZone, "Europe/Berlin");
  // A local calendar day, not a UTC hour bucket.
  assert.match(body.range.from, /^\d{4}-\d{2}-\d{2}$/);
  const buckets = perBucket(body);
  const first = [...buckets.keys()].sort()[0]!;
  assert.equal(buckets.get(first), 24, "first local day should be complete");
});

/**
 * The reason day grouping can't be done in SQL. Berlin runs ahead of UTC, so the
 * last hours of a UTC day are already the next day locally; `substr(bucket,1,10)`
 * files them under the wrong column and no relabelling fixes it.
 */
test("late-evening UTC hours are counted on the next local day in a zone ahead of UTC", async () => {
  const { app, store } = await appWithStore();
  const lateUtc = new Date(Date.now() - 24 * HOUR);
  lateUtc.setUTCHours(23, 0, 0, 0);
  store.analytics.recordHourly([{ bucket: isoHour(lateUtc), dimension: "tab", key: "home" }]);

  const utcDay = lateUtc.toISOString().slice(0, 10);
  const berlinDay = zonedParts(lateUtc.getTime(), "Europe/Berlin").day;
  assert.notEqual(berlinDay, utcDay, "fixture must straddle the local date line");

  const res = await app.inject({
    method: "GET",
    url: "/api/cms/analytics?hours=168&tz=Europe/Berlin",
    headers: auth,
  });
  const rows = (res.json() as AnalyticsResponse).chart.sections;
  assert.equal(rows.find((r) => r.bucket === berlinDay)?.count, 1, "counted on the local day");
  assert.equal(rows.find((r) => r.bucket === utcDay), undefined, "not on the UTC day");
});

test("hour-unit ranges keep exact UTC hour buckets", async () => {
  const { body } = await seededAnalytics("hours=24&tz=Europe/Berlin", 48);
  assert.equal(body.range.unit, "hour");
  assert.equal(body.range.from.length, 13, "an hour bucket, not a local day");
  assert.equal(body.chart.sections.length, 24);
  assert.equal(
    body.chart.sections.reduce((s, r) => s + r.count, 0),
    24,
    "nothing from before the window",
  );
});

test("an unknown timezone falls back instead of throwing", async () => {
  const { body } = await seededAnalytics("hours=168&tz=Not/AZone", 24 * 9);
  assert.equal(body.range.timeZone, "Europe/Berlin");
});

test("the previous period is summarised for comparison", async () => {
  // 14 days of hits read as 7, so the prior 7 days are populated too.
  const { body } = await seededAnalytics("hours=168&tz=UTC", 24 * 14);
  assert.ok(body.previous, "previous window should be present");
  assert.ok(body.previous!.sections > 0, "prior window had traffic");
});

test("the previous period is omitted, not zeroed, when nothing precedes the window", async () => {
  const { body } = await seededAnalytics("hours=168&tz=UTC", 167);
  assert.equal(body.previous, undefined, "no comparison rather than a −100% cliff");
});

/**
 * Clicking a column in the chart narrows the lists underneath it. Before this,
 * Top paths always summarised the whole window, so a traffic spike was visible
 * and unexplainable on the same screen.
 */
test("a bucket can be selected, and the lists narrow to it", async () => {
  const { app, store } = await appWithStore();
  const now = new Date();
  const older = new Date(now.getTime() - 5 * HOUR);
  store.analytics.recordHourly([
    { bucket: isoHour(older), dimension: "path", key: "/spike" },
    { bucket: isoHour(older), dimension: "path", key: "/spike" },
    { bucket: isoHour(now), dimension: "path", key: "/normal" },
  ]);

  const whole = await app.inject({ method: "GET", url: "/api/cms/analytics?hours=24&tz=UTC", headers: auth });
  const wholePaths = (whole.json() as AnalyticsResponse).paths.map((r) => r.key).sort();
  assert.deepEqual(wholePaths, ["/normal", "/spike"], "the range shows both");

  const one = await app.inject({
    method: "GET",
    url: `/api/cms/analytics?hours=24&tz=UTC&at=${isoHour(older)}`,
    headers: auth,
  });
  const body = one.json() as AnalyticsResponse;
  assert.equal(body.range.at, isoHour(older), "the response says what it narrowed to");
  assert.deepEqual(
    body.paths.map((r) => [r.key, r.count]),
    [["/spike", 2]],
    "only the selected hour",
  );
});

test("a selected bucket carries no period comparison", async () => {
  // "vs the hour before" answers a different question from the range picker's.
  const { app, store } = await appWithStore();
  const at = isoHour(new Date());
  store.analytics.recordHourly([{ bucket: at, dimension: "path", key: "/" }]);
  const res = await app.inject({
    method: "GET",
    url: `/api/cms/analytics?hours=24&tz=UTC&at=${at}`,
    headers: auth,
  });
  assert.equal((res.json() as AnalyticsResponse).previous, undefined);
});

test("a day bucket selects the whole local day, not a substring of it", async () => {
  const { app, store } = await appWithStore();
  const now = new Date();
  // 23:00 UTC is the next local day in Berlin — it must be included when that
  // local day is selected, and excluded from the day before.
  const late = new Date(now.getTime() - 24 * HOUR);
  late.setUTCHours(23, 0, 0, 0);
  store.analytics.recordHourly([{ bucket: isoHour(late), dimension: "path", key: "/late" }]);
  const berlinDay = zonedParts(late.getTime(), "Europe/Berlin").day;

  const res = await app.inject({
    method: "GET",
    url: `/api/cms/analytics?hours=168&tz=Europe/Berlin&at=${berlinDay}`,
    headers: auth,
  });
  assert.deepEqual(
    (res.json() as AnalyticsResponse).paths.map((r) => r.key),
    ["/late"],
  );
});

test("a malformed bucket is ignored rather than concatenated into a query", async () => {
  const { body } = await seededAnalytics("hours=24&tz=UTC&at=' OR 1=1 --", 24);
  assert.equal(body.range.at, undefined, "falls back to the whole range");
  assert.equal(body.range.unit, "hour");
});
