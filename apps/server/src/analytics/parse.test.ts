import assert from "node:assert/strict";
import { test } from "node:test";
import { lineToHits, parseUserAgent } from "./parse.js";

const CHROME =
  '203.0.113.7 - - [10/Oct/2026:13:55:36 +0000] "GET /work?tab=1 HTTP/1.1" 200 512 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"';
const ASSET =
  '203.0.113.7 - - [10/Oct/2026:13:55:37 +0000] "GET /_astro/app.css HTTP/1.1" 200 2048 "-" "Mozilla/5.0"';
const IPHONE =
  '198.51.100.2 - - [11/Oct/2026:09:00:00 +0000] "GET / HTTP/1.1" 200 900 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile Safari"';

test("parses a page view into aggregate hits without touching the IP", () => {
  const hits = lineToHits(CHROME, "letsgaming.de");
  const joined = JSON.stringify(hits);
  assert.ok(!joined.includes("203.0.113.7"), "IP must never appear in output");
  assert.ok(hits.some((h) => h.dimension === "path" && h.key === "/work"), "query stripped");
  assert.ok(hits.some((h) => h.dimension === "referrer" && h.key === "news.ycombinator.com"));
  assert.ok(hits.some((h) => h.dimension === "browser" && h.key === "Chrome"));
  assert.ok(hits.some((h) => h.dimension === "os" && h.key === "Windows"));
  assert.ok(hits.some((h) => h.dimension === "device" && h.key === "desktop"));
  assert.equal(hits[0]!.day, "2026-10-10");
});

test("asset requests are not counted", () => {
  assert.equal(lineToHits(ASSET).length, 0);
});

test("direct visit + mobile detection", () => {
  const hits = lineToHits(IPHONE, "letsgaming.de");
  // "-" referrer becomes "direct", filtered only if it equals ownHost (it doesn't)
  assert.ok(hits.some((h) => h.dimension === "referrer" && h.key === "direct"));
  assert.ok(hits.some((h) => h.dimension === "device" && h.key === "mobile"));
  assert.ok(hits.some((h) => h.dimension === "os" && h.key === "iOS"));
});

test("user-agent families", () => {
  assert.equal(parseUserAgent("... Firefox/119 ...").browser, "Firefox");
  assert.equal(parseUserAgent("... Edg/120 ...").browser, "Edge");
  assert.equal(
    parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/17 Safari/605").browser,
    "Safari",
  );
});
