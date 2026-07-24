import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import { probeFamily } from "../../src/analytics/probe.js";

const BUCKET = "2026-07-21T10";

function seeded(paths: [string, number][]) {
  const store = openStore(":memory:");
  const hits = paths.flatMap(([key, n]) =>
    Array.from({ length: n }, () => ({ bucket: BUCKET, dimension: "path" as const, key })),
  );
  store.analytics.recordHourly(hits);
  return store;
}

const totals = (store: ReturnType<typeof openStore>, dim: "path" | "probe") =>
  store.analytics
    .topHourly(dim, BUCKET, BUCKET)
    .reduce((s, r) => s + r.count, 0);

test("stored scanner requests are moved out of page views", () => {
  const store = seeded([
    ["/", 40],
    ["/wp-json/", 2],
    ["/.env", 2],
    ["/wso.php", 1],
    ["/work", 5],
  ]);
  assert.equal(totals(store, "path"), 50, "everything starts as a page view");

  const moved = store.analytics.reclassify("path", "probe", (k) => probeFamily(k));

  assert.equal(moved, 5, "the five scanner requests moved");
  assert.equal(totals(store, "path"), 45, "real traffic is untouched");
  assert.equal(totals(store, "probe"), 5);
  store.close();
});

test("real paths keep their own keys and counts", () => {
  const store = seeded([["/", 40], ["/about", 3], ["/db.php", 7]]);
  store.analytics.reclassify("path", "probe", (k) => probeFamily(k));
  const paths = Object.fromEntries(
    store.analytics.topHourly("path", BUCKET, BUCKET).map((r) => [r.key, r.count]),
  );
  assert.deepEqual(paths, { "/": 40, "/about": 3 });
  store.close();
});

test("probe rows are merged by family, not left as one row per path", () => {
  const store = seeded([["/x.php", 1], ["/xx.php", 1], ["/info.php", 3]]);
  store.analytics.reclassify("path", "probe", (k) => probeFamily(k));
  const probes = store.analytics.topHourly("probe", BUCKET, BUCKET);
  assert.equal(probes.length, 1, "one row for the PHP family");
  assert.equal(probes[0]!.count, 5);
  store.close();
});

test("running it twice is a no-op the second time", () => {
  const store = seeded([["/", 10], ["/.env", 4]]);
  assert.equal(store.analytics.reclassify("path", "probe", (k) => probeFamily(k)), 4);
  assert.equal(store.analytics.reclassify("path", "probe", (k) => probeFamily(k)), 0);
  assert.equal(totals(store, "probe"), 4, "counts are not doubled");
  store.close();
});

test("moving into a family that already has rows adds to it", () => {
  const store = seeded([["/x.php", 2]]);
  store.analytics.recordHourly([
    { bucket: BUCKET, dimension: "probe", key: "PHP probe" },
  ]);
  store.analytics.reclassify("path", "probe", (k) => probeFamily(k));
  assert.equal(totals(store, "probe"), 3, "merged rather than overwritten");
  store.close();
});

test("clearing log-derived dimensions leaves beacon data alone", () => {
  // The distinction that makes a rebuild safe: the log can reconstruct paths and
  // browsers, and can never reconstruct what a visitor did once the page loaded.
  const store = openStore(":memory:");
  store.analytics.recordHourly([
    { bucket: BUCKET, dimension: "path", key: "/" },
    { bucket: BUCKET, dimension: "browser", key: "Chrome" },
    { bucket: BUCKET, dimension: "os", key: "Windows" },
    { bucket: BUCKET, dimension: "referrer", key: "direct" },
    { bucket: BUCKET, dimension: "probe", key: "PHP probe" },
    { bucket: BUCKET, dimension: "tab", key: "home" },
    { bucket: BUCKET, dimension: "session_dwell", key: "30-60s" },
  ]);

  const removed = store.analytics.clearDimensions([
    "path",
    "referrer",
    "browser",
    "os",
    "device",
    "bot",
    "probe",
  ]);

  assert.equal(removed, 5, "the five log-derived rows");
  for (const d of ["path", "browser", "os", "referrer", "probe"] as const) {
    assert.equal(store.analytics.topHourly(d, BUCKET, BUCKET).length, 0, d);
  }
  assert.equal(store.analytics.topHourly("tab", BUCKET, BUCKET).length, 1, "beacon kept");
  assert.equal(store.analytics.topHourly("session_dwell", BUCKET, BUCKET).length, 1, "beacon kept");
  store.close();
});

test("the pollution reclassify cannot reach is exactly what a rebuild fixes", () => {
  // A probe mistaken for a page view wrote five rows. Reclassify moves one of
  // them; the browser/os/device/referrer rows have no link back to it and stay.
  const store = openStore(":memory:");
  store.analytics.recordHourly([
    { bucket: BUCKET, dimension: "path", key: "/wso.php" },
    { bucket: BUCKET, dimension: "browser", key: "Chrome" },
    { bucket: BUCKET, dimension: "os", key: "Windows" },
  ]);
  store.analytics.reclassify("path", "probe", (k) => (k.endsWith(".php") ? "PHP probe" : null));

  assert.equal(store.analytics.topHourly("path", BUCKET, BUCKET).length, 0, "path moved");
  assert.equal(
    store.analytics.topHourly("browser", BUCKET, BUCKET)[0]?.count,
    1,
    "the browser row survives — this is the limit of an in-place fix",
  );
  store.close();
});
