import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "../src/index.js";

/**
 * `keys` on `topHourly`/`seriesHourly` is what a dimension filter (click a
 * referrer/browser/... row in the CMS) narrows the query by. See the analytics
 * route's `filterKeys` for why a *label* (a grouped referrer source) has to be
 * expanded to its member stored keys before it reaches here.
 */

test("topHourly with keys narrows to exactly those keys", () => {
  const store = openStore(":memory:");
  store.analytics.recordHourly([
    { bucket: "2026-09-18T10", dimension: "browser", key: "Chrome" },
    { bucket: "2026-09-18T10", dimension: "browser", key: "Chrome" },
    { bucket: "2026-09-18T10", dimension: "browser", key: "Firefox" },
    { bucket: "2026-09-18T11", dimension: "browser", key: "Safari" },
  ]);
  const all = store.analytics.topHourly("browser", "2026-09-18T00", "2026-09-18T23");
  assert.deepEqual(
    all.map((r) => r.key).sort(),
    ["Chrome", "Firefox", "Safari"],
  );

  const filtered = store.analytics.topHourly("browser", "2026-09-18T00", "2026-09-18T23", 20, ["Chrome"]);
  assert.deepEqual(filtered, [{ key: "Chrome", count: 2 }]);
});

test("topHourly with an empty keys array returns nothing, not everything", () => {
  const store = openStore(":memory:");
  store.analytics.recordHourly([{ bucket: "2026-09-18T10", dimension: "browser", key: "Chrome" }]);
  assert.deepEqual(store.analytics.topHourly("browser", "2026-09-18T00", "2026-09-18T23", 20, []), []);
});

test("topHourly with multiple keys sums each independently, not merged", () => {
  const store = openStore(":memory:");
  store.analytics.recordHourly([
    { bucket: "2026-09-18T10", dimension: "referrer", key: "www.reddit.com" },
    { bucket: "2026-09-18T10", dimension: "referrer", key: "www.reddit.com" },
    { bucket: "2026-09-18T11", dimension: "referrer", key: "old.reddit.com" },
    { bucket: "2026-09-18T11", dimension: "referrer", key: "bing.com" },
  ]);
  const rows = store.analytics.topHourly("referrer", "2026-09-18T00", "2026-09-18T23", 20, [
    "www.reddit.com",
    "old.reddit.com",
  ]);
  assert.deepEqual(
    rows.sort((a, b) => a.key.localeCompare(b.key)),
    [
      { key: "old.reddit.com", count: 1 },
      { key: "www.reddit.com", count: 2 },
    ],
  );
});

test("seriesHourly with keys narrows the per-bucket series", () => {
  const store = openStore(":memory:");
  store.analytics.recordHourly([
    { bucket: "2026-09-18T10", dimension: "browser", key: "Chrome" },
    { bucket: "2026-09-18T11", dimension: "browser", key: "Chrome" },
    { bucket: "2026-09-18T11", dimension: "browser", key: "Firefox" },
  ]);
  const series = store.analytics.seriesHourly("browser", "2026-09-18T00", "2026-09-18T23", "hour", ["Chrome"]);
  assert.deepEqual(series, [
    { bucket: "2026-09-18T10", key: "Chrome", count: 1 },
    { bucket: "2026-09-18T11", key: "Chrome", count: 1 },
  ]);
});

test("seriesHourly with an empty keys array returns nothing, not everything", () => {
  const store = openStore(":memory:");
  store.analytics.recordHourly([{ bucket: "2026-09-18T10", dimension: "browser", key: "Chrome" }]);
  assert.deepEqual(store.analytics.seriesHourly("browser", "2026-09-18T00", "2026-09-18T23", "hour", []), []);
});

test("omitting keys behaves exactly as before (no regression for existing callers)", () => {
  const store = openStore(":memory:");
  store.analytics.recordHourly([
    { bucket: "2026-09-18T10", dimension: "browser", key: "Chrome" },
    { bucket: "2026-09-18T10", dimension: "browser", key: "Firefox" },
  ]);
  const top = store.analytics.topHourly("browser", "2026-09-18T00", "2026-09-18T23");
  assert.equal(top.length, 2);
  const series = store.analytics.seriesHourly("browser", "2026-09-18T00", "2026-09-18T23", "hour");
  assert.equal(series.length, 2);
});
