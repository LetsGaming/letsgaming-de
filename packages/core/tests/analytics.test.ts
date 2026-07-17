import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLEAR_RANGES,
  dwellBucket,
  dwellKey,
  scrollDepthsReached,
  scrollKey,
  sessionTabsBucket,
  transitionKey,
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

/**
 * The browser builds these keys and the server takes them apart. That pair used
 * to be two files each spelling its own separator, and the failure mode is the
 * quiet one: a mismatch doesn't error, it just fails validation, so every event
 * of that dimension is dropped and the dashboard reads as "nobody visited".
 * Round-tripping through the builders is what makes the two halves one decision.
 */
test("every composite key the tracker builds passes validation", () => {
  const ids = new Set(["home", "code"]);
  const passes = (d: "dwell" | "scroll" | "transition", k: string) =>
    validateTrackEvent({ d, k }, ids) !== null;

  assert.ok(passes("dwell", dwellKey("home", dwellBucket(45_000))));
  assert.ok(passes("scroll", scrollKey("code", "75")));
  assert.ok(passes("transition", transitionKey("home", "code")));
});

test("a composite key naming an unknown section is dropped", () => {
  const ids = new Set(["home"]);
  assert.equal(validateTrackEvent({ d: "dwell", k: dwellKey("ghost", "<5s") }, ids), null);
  assert.equal(validateTrackEvent({ d: "transition", k: transitionKey("home", "ghost") }, ids), null);
  // A key with no separator at all must fail closed rather than throw.
  assert.equal(validateTrackEvent({ d: "dwell", k: "home" }, ids), null);
});

/** The CMS renders a button per range and the route switches on the same ids.
 *  `all` is the un-windowed one — the route branches on `hours === null`, so a
 *  second null (or none) silently changes what "clear" clears. */
test("exactly one clear range is un-windowed", () => {
  const unwindowed = CLEAR_RANGES.filter((r) => r.hours === null);
  assert.equal(unwindowed.length, 1);
  assert.equal(unwindowed[0]?.id, "all");
});
