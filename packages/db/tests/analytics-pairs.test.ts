import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "../src/index.js";

const S = "\u0001";
const W = ["2026-09-18T00", "2026-09-18T23"] as const;

test("topCross narrows one dimension by another through the pair counters", () => {
  const store = openStore(":memory:");
  store.analytics.recordHourly([
    { bucket: "2026-09-18T10", dimension: "x:path:referrer", key: `/work${S}bing.com` },
    { bucket: "2026-09-18T10", dimension: "x:path:referrer", key: `/work${S}bing.com` },
    { bucket: "2026-09-18T10", dimension: "x:path:referrer", key: `/about${S}bing.com` },
    { bucket: "2026-09-18T10", dimension: "x:path:referrer", key: `/work${S}direct` },
    { bucket: "2026-09-18T10", dimension: "x:referrer:device", key: `bing.com${S}mobile` },
  ]);
  // The filter is the second half of the key here.
  assert.deepEqual(store.analytics.topCross("referrer", ["bing.com"], "path", ...W), [
    { key: "/work", count: 2 },
    { key: "/about", count: 1 },
  ]);
  // The filter is the first half of the key here.
  assert.deepEqual(store.analytics.topCross("path", ["/work"], "referrer", ...W), [
    { key: "bing.com", count: 2 },
    { key: "direct", count: 1 },
  ]);
  // Canonical order means the pair is found whichever way round it is asked.
  assert.deepEqual(store.analytics.topCross("device", ["mobile"], "referrer", ...W), [{ key: "bing.com", count: 1 }]);
  assert.deepEqual(store.analytics.topCross("path", [], "referrer", ...W), []);
});

test("a pair dimension keeps counting known keys but takes no new ones past the hourly cap", () => {
  const store = openStore(":memory:");
  const bucket = "2026-09-18T10";
  const hits = Array.from({ length: 305 }, (_, i) => ({
    bucket,
    dimension: "x:path:device" as const,
    key: `/p${i}${S}desktop`,
  }));
  store.analytics.recordHourly(hits);
  store.analytics.recordHourly([{ bucket, dimension: "x:path:device", key: `/p0${S}desktop` }]);
  const rows = store.analytics.topCross("device", ["desktop"], "path", ...W, 1000);
  assert.equal(rows.length, 300);
  assert.equal(rows.find((r) => r.key === "/p0")?.count, 2);
  // The cap is per hour: the next hour starts fresh.
  store.analytics.recordHourly([{ bucket: "2026-09-18T11", dimension: "x:path:device", key: `/p304${S}desktop` }]);
  assert.equal(store.analytics.topCross("device", ["desktop"], "path", ...W, 1000).length, 301);
});

test("sumHourly is exact, not cut off at a top-N", () => {
  const store = openStore(":memory:");
  store.analytics.recordHourly(
    Array.from({ length: 50 }, (_, i) => ({ bucket: "2026-09-18T10", dimension: "path" as const, key: `/p${i}` })),
  );
  assert.equal(store.analytics.sumHourly("path", ...W), 50);
  assert.equal(store.analytics.sumHourly("probe", ...W), 0);
});

test("pair rows roll up into daily rows and are removed by clearDimensions", () => {
  const store = openStore(":memory:");
  store.analytics.recordHourly([{ bucket: "2020-01-01T10", dimension: "x:path:os", key: `/${S}Linux` }]);
  assert.equal(store.analytics.rollupAndPrune(30).rolledUp, 1);
  assert.equal(store.analytics.clearDimensions(["x:path:os"]), 1);
});
