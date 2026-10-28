import assert from "node:assert/strict";
import { test } from "node:test";
import { lineToHits, parseUserAgent } from "../../src/analytics/parse.js";

const CHROME =
  '203.0.113.7 - - [10/Oct/2026:13:55:36 +0000] "GET /work?tab=1 HTTP/1.1" 200 512 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"';
const ASSET =
  '203.0.113.7 - - [10/Oct/2026:13:55:37 +0000] "GET /_nuxt/app.css HTTP/1.1" 200 2048 "-" "Mozilla/5.0"';
const IPHONE =
  '198.51.100.2 - - [11/Oct/2026:09:00:00 +0000] "GET / HTTP/1.1" 200 900 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"';

test("parses a page view into aggregate hits without touching the IP", () => {
  const hits = lineToHits(CHROME, "letsgaming.de");
  const joined = JSON.stringify(hits);
  assert.ok(!joined.includes("203.0.113.7"), "IP must never appear in output");
  assert.ok(hits.some((h) => h.dimension === "path" && h.key === "/work"), "query stripped");
  assert.ok(hits.some((h) => h.dimension === "referrer" && h.key === "news.ycombinator.com"));
  assert.ok(hits.some((h) => h.dimension === "browser" && h.key === "Chrome"));
  assert.ok(hits.some((h) => h.dimension === "os" && h.key === "Windows"));
  assert.ok(hits.some((h) => h.dimension === "device" && h.key === "desktop"));
  assert.equal(hits[0]!.bucket, "2026-10-10T13");
});

test("asset requests are not counted", () => {
  assert.equal(lineToHits(ASSET).length, 0);
});

test("CMS preview requests (?preview=1) are not counted", () => {
  const preview =
    '203.0.113.7 - - [10/Oct/2026:13:55:38 +0000] "GET /?preview=1 HTTP/1.1" 200 900 "-" "Mozilla/5.0"';
  assert.equal(lineToHits(preview, "letsgaming.de").length, 0);
  // A normal visit to "/" still counts.
  assert.ok(lineToHits(IPHONE, "letsgaming.de").some((h) => h.dimension === "path" && h.key === "/"));
});

test("local-time log stamps are converted to a UTC hour bucket", () => {
  // 00:30 at +0200 is 22:30 UTC the previous day.
  const line =
    '203.0.113.7 - - [08/Jul/2026:00:30:00 +0200] "GET / HTTP/1.1" 200 900 "-" "Mozilla/5.0"';
  const hits = lineToHits(line, "letsgaming.de");
  assert.equal(hits[0]!.bucket, "2026-07-07T22");
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

test("page view writes traffic and source dimensions alongside the existing keys", () => {
  const hits = lineToHits(CHROME, "letsgaming.de");
  assert.ok(hits.some((h) => h.dimension === "traffic" && h.key === "pageview"));
  assert.ok(hits.some((h) => h.dimension === "source" && h.key === "referral"));
  assert.ok(hits.some((h) => h.dimension === "referrer" && h.key === "news.ycombinator.com"));
  assert.ok(!hits.some((h) => h.dimension === "exclusion"));
  assert.ok(lineToHits(IPHONE, "letsgaming.de").some((h) => h.dimension === "source" && h.key === "direct"));
});

test("tagged visit is a campaign unless the tag names a known network", () => {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const line = (q: string) =>
    `203.0.113.7 - - [10/Oct/2026:13:55:36 +0000] "GET /?${q} HTTP/1.1" 200 512 "-" "${ua}"`;
  const src = (q: string) => lineToHits(line(q), "letsgaming.de").find((h) => h.dimension === "source")!.key;
  assert.equal(src("utm_source=newsletter"), "campaign");
  assert.equal(src("utm_source=discord"), "social");
});

test("bot and probe hits record exclusion rule and traffic class", () => {
  const probe =
    '203.0.113.7 - - [10/Oct/2026:13:55:36 +0000] "GET /wp-login.php HTTP/1.1" 404 10 "-" "Mozilla/5.0 (Windows NT 10.0) Chrome/120"';
  const bot =
    '203.0.113.7 - - [10/Oct/2026:13:55:36 +0000] "GET / HTTP/1.1" 200 10 "-" "curl/8.4.0"';
  const p = lineToHits(probe, "letsgaming.de");
  assert.deepEqual(
    p.map((h) => [h.dimension, h.key]),
    [["probe", "WordPress probe"], ["exclusion", "probe-wordpress"], ["traffic", "probe"]],
  );
  const b = lineToHits(bot, "letsgaming.de");
  assert.deepEqual(
    b.map((h) => [h.dimension, h.key]),
    [["bot", "Script or tool"], ["exclusion", "ua-http-library"], ["traffic", "bot"]],
  );
  assert.ok(!JSON.stringify([p, b]).includes("203.0.113.7"));
});

test("HEAD and write methods count as bots, other methods stay ignored", () => {
  const head =
    '203.0.113.7 - - [10/Oct/2026:13:55:36 +0000] "HEAD / HTTP/1.1" 200 0 "-" "Mozilla/5.0 (Windows NT 10.0) Chrome/120"';
  const post = head.replace('"HEAD /', '"POST /');
  const options = head.replace('"HEAD /', '"OPTIONS /');
  assert.ok(lineToHits(head).some((h) => h.dimension === "exclusion" && h.key === "http-head"));
  assert.ok(lineToHits(post).some((h) => h.dimension === "exclusion" && h.key === "http-post-page"));
  assert.equal(lineToHits(options).length, 0);
});

test("a not-found writes only the traffic class and the rule", () => {
  const line =
    '203.0.113.7 - - [10/Oct/2026:13:55:36 +0000] "GET /blog/ HTTP/2.0" 404 10 "https://example.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36"';
  assert.deepEqual(
    lineToHits(line, "letsgaming.de").map((h) => [h.dimension, h.key]),
    [["exclusion", "not-found"], ["traffic", "notfound"]],
  );
});

test("a page view from the site's own host is filed as direct so referrers sum to page views", () => {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
  const line = (ref: string) =>
    `203.0.113.7 - - [10/Oct/2026:13:55:36 +0000] "GET /about HTTP/2.0" 200 512 "${ref}" "${ua}"`;
  for (const ref of ["https://letsgaming.de/", "https://letsgaming.de", "https://letsgaming.de/admin", "-"]) {
    const hits = lineToHits(line(ref), "letsgaming.de");
    assert.deepEqual(hits.filter((h) => h.dimension === "referrer").map((h) => h.key), ["direct"], ref);
    assert.ok(hits.some((h) => h.dimension === "source" && h.key === "direct"), ref);
  }
});
