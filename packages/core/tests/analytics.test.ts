import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dwellBucket,
  scrollDepthsReached,
  sessionTabsBucket,
  validateTrackEvent,
} from "../src/analytics.js";

test("dwellBucket maps durations to coarse buckets", () => {
  assert.equal(dwellBucket(0), "<5s");
  assert.equal(dwellBucket(4_999), "<5s");
  assert.equal(dwellBucket(5_000), "5-15s");
  assert.equal(dwellBucket(45_000), "30-60s");
  assert.equal(dwellBucket(120_000), "1-3m");
  assert.equal(dwellBucket(60 * 60 * 1000), "10m+");
});

test("sessionTabsBucket caps at 4+", () => {
  assert.equal(sessionTabsBucket(1), "1");
  assert.equal(sessionTabsBucket(3), "3");
  assert.equal(sessionTabsBucket(9), "4+");
});

test("scrollDepthsReached returns only crossed milestones", () => {
  assert.deepEqual(scrollDepthsReached(10), []);
  assert.deepEqual(scrollDepthsReached(60), ["25", "50"]);
  assert.deepEqual(scrollDepthsReached(100), ["25", "50", "75", "100"]);
});

const sections = new Set(["home", "work", "about"]);

test("validateTrackEvent accepts well-formed events against known sections", () => {
  assert.ok(validateTrackEvent({ d: "tab", k: "work" }, sections));
  assert.ok(validateTrackEvent({ d: "transition", k: "home>work" }, sections));
  assert.ok(validateTrackEvent({ d: "dwell", k: "work|30-60s" }, sections));
  assert.ok(validateTrackEvent({ d: "scroll", k: "about|75" }, sections));
  assert.ok(validateTrackEvent({ d: "session_tabs", k: "3" }, sections));
  assert.ok(validateTrackEvent({ d: "click", k: "contact-cta" }, sections));
  assert.ok(validateTrackEvent({ d: "viewport", k: "mobile" }, sections));
  assert.ok(validateTrackEvent({ d: "project", k: "plantcare-tracker" }, sections));
  assert.ok(validateTrackEvent({ d: "theme", k: "dark" }, sections));
});

test("validateTrackEvent rejects unknown sections, buckets, and free text", () => {
  assert.equal(validateTrackEvent({ d: "tab", k: "secret" }, sections), null);
  assert.equal(validateTrackEvent({ d: "transition", k: "home>secret" }, sections), null);
  assert.equal(validateTrackEvent({ d: "dwell", k: "work|9999ms" }, sections), null);
  assert.equal(validateTrackEvent({ d: "scroll", k: "work|33" }, sections), null);
  assert.equal(validateTrackEvent({ d: "click", k: "buy-now" }, sections), null);
  assert.equal(validateTrackEvent({ d: "viewport", k: "watch" }, sections), null);
  assert.equal(validateTrackEvent({ d: "project", k: "bad name!" }, sections), null);
  assert.equal(validateTrackEvent({ d: "theme", k: "neon" }, sections), null);
  assert.equal(
    validateTrackEvent({ d: "evil" as never, k: "x" }, sections),
    null,
  );
  // no overlong / empty keys
  assert.equal(validateTrackEvent({ d: "click", k: "x".repeat(80) }, sections), null);
});
