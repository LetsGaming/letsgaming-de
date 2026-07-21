import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultWrappedSettings,
  sanitizeWrappedSettings,
  wrappedWindow,
  type WrappedSettings,
} from "../src/wrapped.js";

const base: WrappedSettings = { enabled: true, everyMonths: 3, forWeeks: 2, fromDate: "2026-01-01", topCount: 5 };
const at = (iso: string) => new Date(iso);

test("wrappedWindow: disabled is never shown", () => {
  assert.equal(wrappedWindow({ ...base, enabled: false }, at("2026-01-05T12:00:00Z")), null);
});

test("wrappedWindow: nothing before fromDate", () => {
  assert.equal(wrappedWindow(base, at("2025-12-31T23:00:00Z")), null);
});

test("wrappedWindow: inside the first window, summarizes the prior cycle", () => {
  const w = wrappedWindow(base, at("2026-01-05T12:00:00Z"));
  assert.ok(w, "should be active");
  assert.equal(w!.windowStart, "2026-01-01T00:00:00.000Z");
  assert.equal(w!.windowEnd, "2026-01-15T00:00:00.000Z"); // +2 weeks
  assert.equal(w!.periodStart, "2025-10-01T00:00:00.000Z"); // -3 months
  assert.equal(w!.periodEnd, "2026-01-01T00:00:00.000Z");
});

test("wrappedWindow: past the window but before the next cycle is hidden", () => {
  assert.equal(wrappedWindow(base, at("2026-01-20T12:00:00Z")), null);
  assert.equal(wrappedWindow(base, at("2026-02-15T12:00:00Z")), null);
});

test("wrappedWindow: a later cycle's window picks the right boundary + period", () => {
  const w = wrappedWindow(base, at("2026-04-10T09:00:00Z")); // 2nd cycle: Apr 1 → Apr 15
  assert.ok(w);
  assert.equal(w!.windowStart, "2026-04-01T00:00:00.000Z");
  assert.equal(w!.periodStart, "2026-01-01T00:00:00.000Z");
  assert.equal(w!.periodEnd, "2026-04-01T00:00:00.000Z");
});

test("wrappedWindow: exactly on the boundary is in; exactly on windowEnd is out", () => {
  assert.ok(wrappedWindow(base, at("2026-04-01T00:00:00.000Z")), "boundary start is inclusive");
  assert.equal(wrappedWindow(base, at("2026-04-15T00:00:00.000Z")), null, "windowEnd is exclusive");
});

test("wrappedWindow: month-end anchor clamps (Jan 31 + 1mo → Feb 28)", () => {
  const monthly: WrappedSettings = { ...base, everyMonths: 1, forWeeks: 1, fromDate: "2026-01-31" };
  const w = wrappedWindow(monthly, at("2026-03-01T00:00:00.000Z")); // boundary Feb 28, window Feb 28→Mar 7
  assert.ok(w);
  assert.equal(w!.windowStart, "2026-02-28T00:00:00.000Z");
});

test("wrappedWindow: an unparseable date is inert, not a crash", () => {
  assert.equal(wrappedWindow({ ...base, fromDate: "nonsense" }, at("2026-05-05T00:00:00Z")), null);
});

test("sanitizeWrappedSettings clamps out-of-range and drops a bad date", () => {
  const out = sanitizeWrappedSettings({ enabled: true, everyMonths: 999, forWeeks: 0, fromDate: "13/13/2026", topCount: 1 });
  assert.equal(out.enabled, true);
  assert.equal(out.everyMonths, 24); // clamped to max
  assert.equal(out.forWeeks, 1); // clamped to min
  assert.equal(out.topCount, 3); // clamped to min
  assert.equal(out.fromDate, defaultWrappedSettings().fromDate); // bad date → default
});

test("sanitizeWrappedSettings fills a partial body from defaults", () => {
  const d = defaultWrappedSettings();
  const out = sanitizeWrappedSettings({ enabled: true });
  assert.equal(out.enabled, true);
  assert.equal(out.everyMonths, d.everyMonths);
  assert.equal(out.forWeeks, d.forWeeks);
  assert.equal(out.topCount, d.topCount);
});
