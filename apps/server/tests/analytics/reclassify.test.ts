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
