import assert from "node:assert/strict";
import { test } from "node:test";
import { compactNumber, relativeTime } from "../src/format.js";
import { t } from "../src/ui-messages.js";

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

test("compact numbers and ages follow the locale", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  assert.equal(compactNumber(2100), "2.1k");
  assert.equal(compactNumber(2100, "de"), "2,1k");
  assert.equal(compactNumber(1_200_000, "de"), "1,2M");
  assert.equal(compactNumber(2000, "de"), "2k");
  assert.equal(compactNumber(428, "de"), "428");
  assert.equal(relativeTime("2026-01-01T11:55:00Z", now, "de"), "5 Min");
  assert.equal(relativeTime("2026-01-01T10:00:00Z", now, "de"), "2 Std");
  assert.equal(relativeTime("2025-12-30T12:00:00Z", now, "de"), "2 T");
  assert.equal(relativeTime("2025-12-20T12:00:00Z", now, "de"), "1 Wo");
  assert.equal(relativeTime("2025-11-01T12:00:00Z", now, "de"), "2 Mon");
  assert.equal(relativeTime("2024-01-01T12:00:00Z", now, "de"), "2 J");
});

test("a fractional number in a message follows the locale; a whole one stays plain", () => {
  assert.match(t("teaserHoursWeek", "en", { n: 11.4 }), /11\.4/);
  assert.match(t("teaserHoursWeek", "de", { n: 11.4 }), /11,4/);
  assert.match(t("teaserHoursWeek", "de", { n: 12 }), /12/);
});