import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAIR_DIMENSIONS,
  PAIR_SEPARATOR,
  groupPathSeries,
  groupPaths,
  pairDimension,
  pairEntries,
  pairSide,
  pathGroup,
  pathMatchesFilter,
} from "../src/analytics-pairs.js";

test("five dimensions give ten canonical pairs", () => {
  assert.equal(PAIR_DIMENSIONS.length, 10);
  assert.equal(new Set(PAIR_DIMENSIONS).size, 10);
  assert.equal(pairDimension("device", "path"), "x:path:device");
  assert.equal(pairDimension("path", "device"), "x:path:device");
});

test("pairSide says which half of the key a dimension occupies", () => {
  assert.equal(pairSide("x:path:referrer", "path"), "a");
  assert.equal(pairSide("x:path:referrer", "referrer"), "b");
});

test("a page view writes every pair among the dimensions it has", () => {
  const entries = pairEntries({ path: "/work", referrer: "direct", browser: "Chrome", os: "Windows", device: "desktop" });
  assert.equal(entries.length, 10);
  assert.ok(entries.some((e) => e.dimension === "x:path:referrer" && e.key === `/work${PAIR_SEPARATOR}direct`));
});

test("a missing dimension drops only its pairs, and a key holding the separator is skipped", () => {
  assert.equal(pairEntries({ path: "/", browser: "Chrome", os: "Linux", device: "desktop" }).length, 6);
  assert.equal(pairEntries({ path: `/a${PAIR_SEPARATOR}b`, device: "mobile" }).length, 0);
});

test("paths group by first segment", () => {
  assert.equal(pathGroup("/"), "/");
  assert.equal(pathGroup("/work"), "/work");
  assert.equal(pathGroup("/docs/api/auth"), "/docs");
});

test("grouped rows sum their members and expand to them", () => {
  const rows = groupPaths([
    { key: "/docs/a", count: 5 },
    { key: "/", count: 4 },
    { key: "/docs/b", count: 3 },
    { key: "/docs", count: 2 },
  ]);
  assert.deepEqual(rows[0], {
    key: "/docs",
    count: 10,
    children: [
      { key: "/docs/a", count: 5 },
      { key: "/docs/b", count: 3 },
      { key: "/docs", count: 2 },
    ],
  });
  assert.deepEqual(rows[1], { key: "/", count: 4 });
});

test("a group whose only member is itself has nothing to expand", () => {
  assert.deepEqual(groupPaths([{ key: "/work", count: 1 }]), [{ key: "/work", count: 1 }]);
});

test("series rows merge per bucket and group", () => {
  const out = groupPathSeries([
    { bucket: "h1", key: "/docs/a", count: 1 },
    { bucket: "h1", key: "/docs/b", count: 2 },
    { bucket: "h2", key: "/docs/a", count: 4 },
  ]);
  assert.deepEqual(out, [
    { bucket: "h1", key: "/docs", count: 3 },
    { bucket: "h2", key: "/docs", count: 4 },
  ]);
});

test("a path filter takes a whole group or one exact path", () => {
  assert.ok(pathMatchesFilter("/docs/a", "/docs"));
  assert.ok(pathMatchesFilter("/docs/a", "/docs/a"));
  assert.equal(pathMatchesFilter("/docs/b", "/docs/a"), false);
  assert.equal(pathMatchesFilter("/work", "/docs"), false);
});
