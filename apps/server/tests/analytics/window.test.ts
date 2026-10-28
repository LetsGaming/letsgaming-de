import assert from "node:assert/strict";
import { test } from "node:test";
import { axisBuckets } from "@lg/core";
import { buildWindows, bucketWindow } from "../../src/analytics/window.js";

const TZ = "Europe/Berlin";

const sizeOf = (w: { from: string; to: string; unit: "hour" | "day" }): number =>
  axisBuckets(w.from, w.to, w.unit).length;

/** Odd times of day, including either side of midnight in Berlin and a DST week. */
const NOWS = [
  "2026-10-28T13:47:12Z",
  "2026-10-28T22:30:00Z",
  "2026-10-28T23:59:59Z",
  "2026-10-29T00:05:00Z",
  "2026-10-26T10:15:00Z",
  "2026-03-30T08:00:00Z",
];

test("day windows are equal in length and the previous one ends where the current one starts", () => {
  for (const iso of NOWS) {
    for (const hours of [168, 720, 2160]) {
      const { current, previous } = buildWindows({ now: new Date(iso), hours, unit: "day", timeZone: TZ });
      const days = Math.ceil(hours / 24);
      assert.equal(sizeOf(current), days, `${iso} ${hours}h current`);
      assert.equal(sizeOf(previous), days, `${iso} ${hours}h previous`);
      const next = new Date(Date.parse(`${previous.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      assert.equal(next, current.from, "adjacent, never overlapping");
      assert.ok(previous.toB < current.fromB, "the UTC spans do not overlap either");
    }
  }
});

test("a day window crossing the autumn DST change still holds whole local days", () => {
  const { current, previous } = buildWindows({
    now: new Date("2026-10-27T10:00:00Z"),
    hours: 168,
    unit: "day",
    timeZone: TZ,
  });
  assert.equal(current.from, "2026-10-21");
  assert.equal(current.to, "2026-10-27");
  assert.equal(previous.from, "2026-10-14");
  assert.equal(previous.to, "2026-10-20");
  // 2026-10-25 is 25 hours long: the span is longer than 7 * 24 hours.
  const hoursInCurrent = (Date.parse(`${current.toB}:00:00Z`) - Date.parse(`${current.fromB}:00:00Z`)) / 3_600_000 + 1;
  assert.equal(hoursInCurrent, 7 * 24 + 1);
});

test("hour windows are equal in length and adjacent", () => {
  for (const iso of NOWS) {
    for (const hours of [1, 24, 72]) {
      const { current, previous } = buildWindows({ now: new Date(iso), hours, unit: "hour", timeZone: TZ });
      assert.equal(sizeOf(current), hours);
      assert.equal(sizeOf(previous), hours);
      assert.equal(new Date(Date.parse(`${previous.to}:00:00Z`) + 3_600_000).toISOString().slice(0, 13), current.from);
      assert.equal(current.to, new Date(iso).toISOString().slice(0, 13), "the current hour is included");
    }
  }
});

test("a custom range compares against the same number of days right before it", () => {
  const { current, previous } = buildWindows({
    now: new Date("2026-10-28T12:00:00Z"),
    hours: 0,
    unit: "day",
    timeZone: TZ,
    custom: { from: "2026-10-10", to: "2026-10-12" },
  });
  assert.deepEqual([current.from, current.to], ["2026-10-10", "2026-10-12"]);
  assert.deepEqual([previous.from, previous.to], ["2026-10-07", "2026-10-09"]);
});

test("a selected bucket is an hour or a whole local day", () => {
  const hour = bucketWindow("2026-10-25T08", TZ);
  assert.deepEqual([hour.unit, hour.fromB, hour.toB], ["hour", "2026-10-25T08", "2026-10-25T08"]);
  const day = bucketWindow("2026-10-25", TZ);
  assert.equal(day.unit, "day");
  assert.equal(day.fromB, "2026-10-24T22");
  assert.equal(day.toB, "2026-10-25T22", "a 25-hour day");
});
