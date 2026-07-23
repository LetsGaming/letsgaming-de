import test from "node:test";
import assert from "node:assert/strict";
import {
  OTHER_KEY,
  axisBuckets,
  bucketLabel,
  buildStackedChart,
  columnAtX,
  niceCeil,
  yAxisTicks,
  type SeriesRow,
} from "../src/chart.js";

const rows = (...r: [string, string, number][]): SeriesRow[] =>
  r.map(([bucket, key, count]) => ({ bucket, key, count }));

test("axisBuckets enumerates every hour inclusively", () => {
  const b = axisBuckets("2026-07-17T09", "2026-07-17T12", "hour");
  assert.deepEqual(b, ["2026-07-17T09", "2026-07-17T10", "2026-07-17T11", "2026-07-17T12"]);
});

test("axisBuckets enumerates whole days, ignoring the hour part of the bounds", () => {
  const b = axisBuckets("2026-06-30T22", "2026-07-02T03", "day");
  assert.deepEqual(b, ["2026-06-30", "2026-07-01", "2026-07-02"]);
});

test("axisBuckets crosses a month and a DST boundary without drifting", () => {
  // 29 Mar 2026 is the European DST switch; UTC arithmetic must not care.
  const b = axisBuckets("2026-03-28", "2026-03-31", "day");
  assert.deepEqual(b, ["2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
});

test("axisBuckets returns nothing for malformed bounds rather than looping forever", () => {
  assert.deepEqual(axisBuckets("not-a-date", "also-not", "day"), []);
});

test("empty buckets are kept — a gap in traffic is data, not a reason to rescale time", () => {
  const c = buildStackedChart({
    rows: rows(["2026-07-17T09", "a", 5], ["2026-07-17T11", "a", 3]),
    from: "2026-07-17T09",
    to: "2026-07-17T11",
    unit: "hour",
  });
  assert.equal(c.columns.length, 3);
  assert.equal(c.columns[1]!.total, 0);
  assert.deepEqual(c.columns[1]!.values, []);
});

test("columns carry the value at that bucket, not the layer's range total", () => {
  const c = buildStackedChart({
    rows: rows(
      ["2026-07-01", "life", 10],
      ["2026-07-02", "life", 90],
      ["2026-07-01", "work", 4],
    ),
    from: "2026-07-01",
    to: "2026-07-02",
    unit: "day",
  });
  const life = c.layers.find((l) => l.key === "life")!;
  assert.equal(life.total, 100, "layer total spans the range");
  // The regression the old <title> had: hovering day 1 must say 10, not 100.
  const day1 = c.columns[0]!;
  assert.equal(day1.values.find((v) => v.key === "life")!.count, 10);
  assert.equal(day1.total, 14);
});

test("column values are non-zero only, largest first", () => {
  const c = buildStackedChart({
    rows: rows(["2026-07-01", "a", 2], ["2026-07-01", "b", 9], ["2026-07-02", "c", 1]),
    from: "2026-07-01",
    to: "2026-07-02",
    unit: "day",
  });
  assert.deepEqual(
    c.columns[0]!.values.map((v) => [v.key, v.count]),
    [
      ["b", 9],
      ["a", 2],
    ],
  );
});

test("overflow series group under a key no real series can collide with", () => {
  const many = Array.from({ length: 9 }, (_, i): [string, string, number] => [
    "2026-07-01",
    `k${i}`,
    10 - i,
  ]);
  const c = buildStackedChart({ rows: rows(...many), from: "2026-07-01", to: "2026-07-01", unit: "day" });
  assert.equal(c.layers.length, 7, "6 kept + 1 grouped");
  const other = c.layers.at(-1)!;
  assert.equal(other.key, OTHER_KEY);
  assert.equal(other.isOther, true);
  assert.equal(other.label, "other (3)");
  // k6+k7+k8 = 4+3+2
  assert.equal(other.total, 9);
});

test("a real series literally named 'other' is not merged into the overflow band", () => {
  const many: [string, string, number][] = [
    ["2026-07-01", "other", 100],
    ...Array.from({ length: 8 }, (_, i): [string, string, number] => ["2026-07-01", `k${i}`, 9 - i]),
  ];
  const c = buildStackedChart({ rows: rows(...many), from: "2026-07-01", to: "2026-07-01", unit: "day" });
  const real = c.layers.find((l) => l.key === "other")!;
  assert.equal(real.total, 100, "the real series keeps its own count");
  assert.equal(real.isOther, false);
  assert.ok(c.layers.some((l) => l.key === OTHER_KEY), "grouped band is separate");
});

test("chart total equals the sum of every column", () => {
  const c = buildStackedChart({
    rows: rows(["2026-07-01", "a", 3], ["2026-07-02", "a", 4], ["2026-07-02", "b", 5]),
    from: "2026-07-01",
    to: "2026-07-02",
    unit: "day",
  });
  assert.equal(c.total, 12);
  assert.equal(
    c.total,
    c.columns.reduce((s, col) => s + col.total, 0),
  );
});

test("rows outside the axis are dropped rather than silently skewing totals", () => {
  const c = buildStackedChart({
    rows: rows(["2026-06-01", "a", 999], ["2026-07-01", "a", 2]),
    from: "2026-07-01",
    to: "2026-07-01",
    unit: "day",
  });
  assert.equal(c.total, 2);
});

test("layers stack: each band starts where the previous one ended", () => {
  const c = buildStackedChart({
    rows: rows(["2026-07-01", "a", 4], ["2026-07-01", "b", 6]),
    from: "2026-07-01",
    to: "2026-07-02",
    unit: "day",
  });
  const [first, second] = c.layers;
  assert.equal(first!.key, "b", "largest first");
  assert.equal(second!.key, "a");
  assert.equal(c.columns[0]!.total, 10);
});

test("columnAtX maps the plot edges to the first and last buckets", () => {
  const c = buildStackedChart({
    rows: rows(["2026-07-01", "a", 1]),
    from: "2026-07-01",
    to: "2026-07-05",
    unit: "day",
  });
  assert.equal(columnAtX(c, c.x0)!.bucket, "2026-07-01");
  assert.equal(columnAtX(c, c.x1)!.bucket, "2026-07-05");
  // Outside the plot clamps rather than returning undefined.
  assert.equal(columnAtX(c, c.x0 - 500)!.bucket, "2026-07-01");
  assert.equal(columnAtX(c, c.x1 + 500)!.bucket, "2026-07-05");
});

test("columnAtX picks the nearest bucket, not the one to the left", () => {
  const c = buildStackedChart({
    rows: rows(["2026-07-01", "a", 1]),
    from: "2026-07-01",
    to: "2026-07-03",
    unit: "day",
  });
  const mid = c.columns[1]!;
  assert.equal(columnAtX(c, mid.x - 1)!.bucket, mid.bucket);
  assert.equal(columnAtX(c, mid.x + 1)!.bucket, mid.bucket);
});

test("an all-empty range still produces a usable axis", () => {
  const c = buildStackedChart({ rows: [], from: "2026-07-01", to: "2026-07-03", unit: "day" });
  assert.equal(c.total, 0);
  assert.equal(c.layers.length, 0);
  assert.equal(c.columns.length, 3);
  assert.ok(c.yTicks.length >= 2, "y axis still has ticks");
  assert.equal(c.max, 1, "max floors at 1 so nothing divides by zero");
});

test("y ticks are whole numbers starting at zero", () => {
  const { top, ticks } = yAxisTicks(37);
  assert.equal(ticks[0], 0);
  assert.ok(top >= 37);
  assert.ok(
    ticks.every((t) => Number.isInteger(t)),
    "count axes must not show fractional ticks",
  );
});

test("niceCeil never returns zero, so it can always be divided by", () => {
  assert.equal(niceCeil(0), 1);
  assert.equal(niceCeil(-5), 1);
});

test("hour labels shift into the requested zone; day labels are already local", () => {
  // 22:00 UTC is 00:00 the next day in Berlin summer time.
  assert.equal(bucketLabel("2026-07-14T22", "hour", "UTC"), "07-14 22h");
  assert.equal(bucketLabel("2026-07-14T22", "hour", "Europe/Berlin"), "07-15 00h");
  // Day buckets arrive already grouped in the reader's zone — shifting them
  // again would move a column that was placed correctly.
  assert.equal(bucketLabel("2026-07-15", "day", "Europe/Berlin"), "07-15");
});

test("hour labels respect a winter offset too, not a fixed one", () => {
  assert.equal(bucketLabel("2026-01-14T23", "hour", "Europe/Berlin"), "01-15 00h");
});
