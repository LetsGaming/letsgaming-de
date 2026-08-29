import assert from "node:assert/strict";
import { test } from "node:test";
import { relativeTime } from "../src/format.js";

test("relativeTime floors at 1m, not 'now' — every consumer composes it into an '{age} ago' template", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  assert.equal(relativeTime("2026-01-01T11:59:59Z", now), "1m"); // 1 second ago
  assert.equal(relativeTime("2026-01-01T12:00:00Z", now), "1m"); // this instant
  assert.equal(relativeTime("2026-01-01T11:59:00Z", now), "1m"); // exactly 1 minute
  assert.equal(relativeTime("2026-01-01T11:55:00Z", now), "5m");
});

test("relativeTime steps through hours, days, weeks, months, years", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  assert.equal(relativeTime("2026-01-01T10:00:00Z", now), "2h");
  assert.equal(relativeTime("2025-12-30T12:00:00Z", now), "2d");
  assert.equal(relativeTime("2025-12-20T12:00:00Z", now), "1w");
  assert.equal(relativeTime("2025-11-01T12:00:00Z", now), "2mo");
  assert.equal(relativeTime("2024-01-01T12:00:00Z", now), "2y");
});

test("relativeTime returns empty for an unparseable date rather than crashing", () => {
  assert.equal(relativeTime("not-a-date"), "");
});
