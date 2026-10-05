import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import type { HourlyHit } from "@lg/db";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/env.js";
import type { AnalyticsResponse } from "@lg/core";

const TOKEN = "c".repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };
const S = "\u0001";
const bucket = new Date().toISOString().slice(0, 13);

/** Page views: /docs/a and /docs/b from bing on mobile, /work from direct on desktop. */
function seed(): HourlyHit[] {
  const h = (dimension: HourlyHit["dimension"], key: string, n = 1): HourlyHit[] =>
    Array.from({ length: n }, () => ({ bucket, dimension, key }));
  return [
    ...h("path", "/docs/a", 2),
    ...h("path", "/docs/b", 1),
    ...h("path", "/work", 4),
    ...h("referrer", "www.bing.com", 3),
    ...h("referrer", "direct", 4),
    ...h("device", "mobile", 3),
    ...h("device", "desktop", 4),
    ...h("x:path:referrer", `/docs/a${S}www.bing.com`, 2),
    ...h("x:path:referrer", `/docs/b${S}www.bing.com`, 1),
    ...h("x:path:referrer", `/work${S}direct`, 4),
    ...h("x:path:device", `/docs/a${S}mobile`, 2),
    ...h("x:path:device", `/docs/b${S}mobile`, 1),
    ...h("x:path:device", `/work${S}desktop`, 4),
    ...h("x:referrer:device", `www.bing.com${S}mobile`, 3),
    ...h("x:referrer:device", `direct${S}desktop`, 4),
    ...h("session_dwell", "<5s", 2),
    ...h("session_dwell", "1-3m", 1),
    ...h("bot", "Search engine", 5),
    ...h("tab", "home", 6),
  ];
}

async function get(query: string) {
  const store = openStore(":memory:");
  const env = loadEnv({ CMS_TOKEN: TOKEN, WEB_ORIGIN: "http://localhost:4321" });
  const app = await buildApp(store, env);
  store.analytics.recordHourly(seed());
  const res = await app.inject({ method: "GET", url: `/api/cms/analytics?hours=24&tz=UTC&${query}`, headers: auth });
  assert.equal(res.statusCode, 200);
  return res.json() as AnalyticsResponse;
}

test("visits and pageviews are separate figures, each naming its source", async () => {
  const body = await get("");
  assert.deepEqual(body.visits, { total: 3, previous: 0, source: "script" });
  assert.deepEqual(body.pageviews, { total: 7, previous: 0, source: "log" });
  assert.equal(body.metricSources.pageviews, "log");
  assert.equal(body.metricSources.visitLength, "script");
});

async function getWith(hits: HourlyHit[]) {
  const store = openStore(":memory:");
  const env = loadEnv({ CMS_TOKEN: TOKEN, WEB_ORIGIN: "http://localhost:4321" });
  const app = await buildApp(store, env);
  store.analytics.recordHourly(hits);
  const res = await app.inject({ method: "GET", url: "/api/cms/analytics?hours=24&tz=UTC", headers: auth });
  assert.equal(res.statusCode, 200);
  return res.json() as AnalyticsResponse;
}

test("secondPage is the share of confirmed visits that touched a second section", async () => {
  const h = (key: string, n: number): HourlyHit[] =>
    Array.from({ length: n }, () => ({ bucket, dimension: "session_tabs" as const, key }));
  const body = await getWith([...h("1", 6), ...h("2", 2), ...h("4+", 2)]);
  assert.deepEqual(body.secondPage, { visits: 10, reached: 4, rate: 0.4, source: "script" });
});

test("secondPage has a null rate when no visit was confirmed", async () => {
  const body = await getWith([]);
  assert.deepEqual(body.secondPage, { visits: 0, reached: 0, rate: null, source: "script" });
});

test("paths are grouped by first segment and expand to their sub-paths", async () => {
  const body = await get("");
  assert.deepEqual(body.paths.map((p) => [p.key, p.count]), [
    ["/work", 4],
    ["/docs", 3],
  ]);
  assert.deepEqual(body.paths[1]!.children, [
    { key: "/docs/a", count: 2 },
    { key: "/docs/b", count: 1 },
  ]);
  assert.equal(body.paths[0]!.children, undefined);
  // The chart legend gets the group too, not each sub-path.
  assert.deepEqual([...new Set(body.chart.pageviews.map((r) => r.key))].sort(), ["/docs", "/work"]);
});

test("a referrer filter narrows every page-view list, not just one", async () => {
  const body = await get("dim=referrer&key=Bing");
  assert.deepEqual(body.paths.map((p) => [p.key, p.count]), [["/docs", 3]]);
  assert.deepEqual(body.devices, [{ key: "mobile", count: 3 }]);
  // The filtered dimension's own card stays whole so another row can be picked.
  assert.equal(body.referrers.length, 2);
  assert.deepEqual(body.bots, []);
  assert.equal(body.filtered?.total, 3);
  assert.ok(body.filtered?.narrowed.includes("paths"));
  assert.deepEqual(body.filtered?.notFilterable, [{ card: "engagement", source: "script" }]);
  // The script's lists cannot be crossed and come back whole.
  assert.equal(body.engagement.tabs[0]?.count, 6);
});

test("a path filter on a group takes all its sub-paths", async () => {
  const body = await get("dim=path&key=/docs");
  assert.deepEqual(body.referrers, [{ key: "Bing", count: 3 }]);
  assert.deepEqual(body.devices, [{ key: "mobile", count: 3 }]);
  assert.equal(body.filtered?.total, 3);
});

test("a path filter on one concrete sub-path takes just that path", async () => {
  const body = await get("dim=path&key=/docs/b");
  assert.deepEqual(body.devices, [{ key: "mobile", count: 1 }]);
});

test("a script dimension cannot narrow the log lists and says so", async () => {
  const body = await get("dim=click&key=nav");
  assert.deepEqual(body.filtered?.narrowed, []);
  assert.ok(body.filtered?.notFilterable.some((n) => n.card === "paths" && n.source === "log"));
  assert.equal(body.paths.length, 2);
});
