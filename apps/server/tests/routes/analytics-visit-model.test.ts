import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore, shiftDay, zonedParts, type HourlyHit } from "@lg/db";
import type { AnalyticsResponseFull } from "@lg/core";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/env.js";
import { modulesInPageOrder } from "../../src/analytics/blocks.js";
import { catchUp } from "../../src/analytics/rollup.js";

const TOKEN = "c".repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };
const TZ = "Europe/Berlin";
const isoHour = (d: Date) => d.toISOString().slice(0, 13);
const berlinToday = (): string => zonedParts(Date.now(), TZ).day;
const hits = (bucket: string, dimension: HourlyHit["dimension"], key: string, n = 1): HourlyHit[] =>
  Array.from({ length: n }, () => ({ bucket, dimension, key }));

async function appWithStore() {
  const store = openStore(":memory:");
  const env = loadEnv({ CMS_TOKEN: TOKEN, WEB_ORIGIN: "http://localhost:4321" });
  return { app: await buildApp(store, env), store };
}

async function fetchFull(app: Awaited<ReturnType<typeof appWithStore>>["app"], query: string) {
  const res = await app.inject({ method: "GET", url: `/api/cms/analytics?${query}`, headers: auth });
  assert.equal(res.statusCode, 200);
  return res.json() as AnalyticsResponseFull;
}

test("headline deltas compare two equal, non-overlapping windows", async () => {
  const { app, store } = await appWithStore();
  const today = berlinToday();
  // One hit at midday UTC on each of the last 14 local days, plus 3 extra in the current window.
  const rows: HourlyHit[] = [];
  for (let i = 0; i < 14; i++) rows.push(...hits(`${shiftDay(today, -i)}T12`, "path", "/"));
  rows.push(...hits(`${shiftDay(today, -3)}T12`, "path", "/", 3));
  store.analytics.recordHourly(rows);

  const body = await fetchFull(app, `hours=168&tz=${TZ}`);
  assert.equal(body.range.from, shiftDay(today, -6));
  assert.equal(body.range.to, today);
  assert.deepEqual(body.range.previous, { from: shiftDay(today, -13), to: shiftDay(today, -7) });

  const pv = body.headline.pageviews;
  assert.equal(pv.total, 10);
  assert.equal(pv.previous, 7);
  assert.ok(Math.abs(pv.deltaPct! - (3 / 7) * 100) < 1e-9);
  assert.equal(pv.series.length, 7);
  assert.equal(pv.series.reduce((a, b) => a + b, 0), 10);
  assert.equal(body.pageviews.total, 10);
  assert.equal(body.pageviews.previous, 7);
  assert.equal(body.previous?.pageviews, 7);
});

test("a selected bucket has no comparison window", async () => {
  const { app, store } = await appWithStore();
  const hour = isoHour(new Date());
  store.analytics.recordHourly(hits(hour, "path", "/"));
  const body = await fetchFull(app, `hours=24&tz=UTC&at=${hour}`);
  assert.equal(body.range.previous, null);
  assert.equal(body.headline.pageviews.previous, null);
  assert.equal(body.headline.pageviews.deltaPct, null);
});

test("the quality funnel reconciles requests, loads and confirmed visits", async () => {
  const { app, store } = await appWithStore();
  const now = isoHour(new Date());
  store.analytics.recordHourly([
    ...hits(now, "path", "/", 10),
    ...hits(now, "bot", "Googlebot", 2),
    ...hits(now, "probe", "WordPress probe", 3),
    ...hits(now, "viewport", "desktop", 4),
    ...hits(now, "visit", "scroll", 2),
    ...hits(now, "visit", "click", 1),
    ...hits(now, "session_dwell", "1-3m", 2),
    ...hits(now, "exclusion", "headless-ua", 2),
    ...hits(now, "source", "direct", 6),
    ...hits(now, "source", "search", 4),
  ]);
  const body = await fetchFull(app, "hours=24&tz=UTC");
  assert.deepEqual(body.quality.funnel, {
    requests: 15,
    probes: 3,
    bots: 2,
    unverified: 6,
    loads: 4,
    confirmed: 3,
    completed: 2,
  });
  assert.equal(body.quality.coverage, 0.4);
  assert.equal(body.quality.confirmationRate, 0.75);
  assert.equal(body.quality.confirmationSince, now);
  assert.equal(body.quality.measured, true);
  assert.equal(body.quality.partiallyMeasured, true, "the range starts a day before the first visit event");
  assert.deepEqual(body.quality.exclusions, [{ key: "headless-ua", count: 2 }]);
  assert.equal(body.visits.total, 3);
  assert.equal(body.visits.measured, true);
  assert.equal(body.completedVisits.total, 2);
  assert.deepEqual(body.sources, {
    total: 10,
    rows: [
      { key: "direct", count: 6, share: 0.6 },
      { key: "search", count: 4, share: 0.4 },
    ],
  });
  for (const id of [
    "pageviews",
    "confirmedVisits",
    "loads",
    "beaconCoverage",
    "sectionsPerVisit",
    "medianVisitSeconds",
    "clicks",
    "bots",
    "probes",
  ] as const) {
    const m = body.headline[id];
    assert.ok("total" in m && "previous" in m && "deltaPct" in m, id);
    assert.equal(m.series.length, 24, id);
  }
  assert.equal(body.headline.confirmedVisits.total, 3);
  assert.equal(body.headline.medianVisitSeconds.total, 120);
  assert.equal(body.secondPage.source, "script", "the deprecated field is still sent");
});

test("with no visits and no loads the ratios are null, not zero", async () => {
  const { app } = await appWithStore();
  const body = await fetchFull(app, "hours=24&tz=UTC");
  assert.equal(body.quality.coverage, null);
  assert.equal(body.quality.confirmationRate, null);
  assert.equal(body.headline.beaconCoverage.total, null);
  assert.equal(body.headline.sectionsPerVisit.total, null);
  assert.equal(body.headline.medianVisitSeconds.total, null);
  assert.equal(body.quality.funnel.unverified, 0);
});

test("confirmation is not measured before the first visit event", async () => {
  const { app, store } = await appWithStore();
  const now = isoHour(new Date());
  store.analytics.recordHourly([...hits(now, "path", "/", 5), ...hits(now, "viewport", "desktop", 3)]);

  let body = await fetchFull(app, "hours=24&tz=UTC");
  assert.equal(body.visits.measured, false);
  assert.equal(body.visits.total, 0);
  assert.equal(body.quality.measured, false);
  assert.equal(body.quality.confirmationSince, null);
  assert.equal(body.headline.confirmedVisits.measured, false);
  assert.equal(body.headline.confirmedVisits.deltaPct, null);
  assert.equal(body.headline.loads.measured, true, "loads existed before the cutover");
  assert.equal(body.quality.funnel.unverified, 2);

  store.analytics.recordHourly(hits(now, "visit", "dwell"));
  body = await fetchFull(app, "hours=24&tz=UTC");
  assert.equal(body.visits.measured, true);
  assert.equal(body.visits.total, 1);
});

test("a range that ends before the first visit event is not measured", async () => {
  const { app, store } = await appWithStore();
  const today = berlinToday();
  store.analytics.recordHourly([
    ...hits(`${shiftDay(today, -9)}T12`, "path", "/", 4),
    ...hits(`${shiftDay(today, -2)}T12`, "visit", "scroll"),
  ]);
  const before = await fetchFull(app, `from=${shiftDay(today, -10)}&to=${shiftDay(today, -8)}&tz=${TZ}`);
  assert.equal(before.quality.measured, false);
  assert.equal(before.visits.measured, false);
  assert.notEqual(before.quality.confirmationSince, null);
  const across = await fetchFull(app, `from=${shiftDay(today, -4)}&to=${today}&tz=${TZ}`);
  assert.equal(across.visits.measured, true);
  assert.equal(across.quality.partiallyMeasured, true);
});

test("the sections block lists modules in page order with seen rate, flow and dwell", async () => {
  const { app, store } = await appWithStore();
  const order = modulesInPageOrder(store.ia.getNav(), store.ia.getModules());
  const [m1, m2] = [order[0]!.id, order[1]!.id];
  const area = store.ia.getNav()[0]!.id;
  const now = isoHour(new Date());
  store.analytics.recordHourly([
    ...hits(now, "viewport", "desktop", 4),
    ...hits(now, "module", m1, 3),
    ...hits(now, "module", m2, 1),
    ...hits(now, "module_entry", m1, 2),
    ...hits(now, "module_exit", m2, 1),
    ...hits(now, "module_dwell", `${m1}|5-15s`, 3),
    ...hits(now, "module_flow", `${m1}>${m2}`, 2),
    ...hits(now, "session_modules", "2", 2),
    ...hits(now, "session_modules", "4+", 1),
    ...hits(now, "tab", area, 4),
    ...hits(now, "scroll", `${area}|25`, 2),
  ]);
  const { sections } = await fetchFull(app, "hours=24&tz=UTC");
  assert.deepEqual(
    sections.modules.map((m) => m.id),
    order.map((m) => m.id),
  );
  assert.equal(sections.loads, 4);
  const first = sections.modules[0]!;
  assert.deepEqual(
    { seen: first.seen, rate: first.seenRate, entries: first.entries, median: first.medianDwellSeconds },
    { seen: 3, rate: 0.75, entries: 2, median: 10 },
  );
  assert.equal(first.dwell["5-15s"], 3);
  assert.equal(first.dwell["<5s"], 0, "every bucket is present");
  assert.equal(sections.modules[1]!.exits, 1);
  assert.deepEqual(sections.flow, [{ from: m1, to: m2, count: 2 }]);
  assert.deepEqual(sections.sessionModules, [
    { bucket: "1", count: 0 },
    { bucket: "2", count: 2 },
    { bucket: "3", count: 0 },
    { bucket: "4+", count: 1 },
  ]);
  assert.deepEqual(sections.scrollDepth, [{ area, views: 4, depths: { "25": 2, "50": 0, "75": 0, "100": 0 } }]);
});

test("reading from the stored rollups gives the same figures as the live top-up", async () => {
  const { app, store } = await appWithStore();
  const today = berlinToday();
  const rows: HourlyHit[] = [];
  for (let i = 1; i < 12; i++) {
    const h = `${shiftDay(today, -i)}T12`;
    rows.push(...hits(h, "path", "/", i), ...hits(h, "viewport", "desktop", 1), ...hits(h, "visit", "scroll", 1));
  }
  store.analytics.recordHourly(rows);
  const pick = (b: AnalyticsResponseFull) => ({ h: b.headline, q: b.quality, s: b.sections, so: b.sources, v: b.visits });
  const live = pick(await fetchFull(app, `hours=336&tz=${TZ}`));
  catchUp(store);
  assert.notEqual(store.analytics.getRollupState("day"), null);
  const stored = pick(await fetchFull(app, `hours=336&tz=${TZ}`));
  assert.deepEqual(stored, live);
});

test("another zone's day range is rebuilt from hourly rows and flagged approximate", async () => {
  const { app } = await appWithStore();
  assert.equal((await fetchFull(app, "hours=168&tz=America/New_York")).range.approximateZone, true);
  assert.equal((await fetchFull(app, `hours=168&tz=${TZ}`)).range.approximateZone, undefined);
  assert.equal((await fetchFull(app, "hours=24&tz=America/New_York")).range.approximateZone, undefined);
});

test("clearing everything removes the rollups too", async () => {
  const { app, store } = await appWithStore();
  store.analytics.recordHourly(hits(isoHour(new Date()), "path", "/", 3));
  catchUp(store);
  const res = await app.inject({
    method: "POST",
    url: "/api/cms/analytics/clear",
    headers: auth,
    payload: { range: "all" },
  });
  assert.equal(res.statusCode, 200);
  const body = await fetchFull(app, `hours=24&tz=${TZ}`);
  assert.equal(body.headline.pageviews.total, 0);
  assert.equal(store.analytics.getRollupState("hour"), null);
});
