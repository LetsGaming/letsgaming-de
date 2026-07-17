import assert from "node:assert/strict";
import { test } from "node:test";
import { botFamily, BOT_FAMILY } from "../src/analytics/agent.js";
import { lineToHits } from "../src/analytics/parse.js";

const line = (path: string, ua: string, status = 200) =>
  `192.0.2.1 - - [17/Jul/2026:10:00:00 +0000] "GET ${path} HTTP/1.1" ${status} 512 "-" "${ua}"`;

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

// ── the thing the dashboard was actually counting ────────────────────────────

test("the admin is not the site", () => {
  // Five of six "page views" were the owner reading his own CMS; opening the
  // editor logged two, because the canvas is an iframe with its own URL.
  assert.deepEqual(lineToHits(line("/admin", CHROME)), []);
  assert.deepEqual(lineToHits(line("/admin/canvas", CHROME)), []);
  // But a page that merely starts with those letters is the site.
  assert.ok(lineToHits(line("/administration-of-plants", CHROME)).length > 0);
});

test("a real page view still counts", () => {
  const hits = lineToHits(line("/life", CHROME));
  assert.ok(hits.some((h) => h.dimension === "path" && h.key === "/life"));
  assert.ok(hits.some((h) => h.dimension === "browser" && h.key === "Chrome"));
  assert.ok(!hits.some((h) => h.dimension === "bot"));
});

// ── bots ─────────────────────────────────────────────────────────────────────

test("agents that admit what they are, get named", () => {
  assert.equal(botFamily("Mozilla/5.0 (compatible; Googlebot/2.1)"), BOT_FAMILY.search);
  assert.equal(botFamily("curl/8.7.1"), BOT_FAMILY.tool);
  assert.equal(botFamily("python-requests/2.31.0"), BOT_FAMILY.tool);
  assert.equal(botFamily("Mozilla/5.0 (compatible; ClaudeBot/1.0)"), BOT_FAMILY.ai);
  assert.equal(botFamily("UptimeRobot/2.0"), BOT_FAMILY.monitor);
  assert.equal(botFamily("facebookexternalhit/1.1"), BOT_FAMILY.social);
  assert.equal(botFamily("SomeRandomBot/1.0"), BOT_FAMILY.other);
  assert.equal(botFamily(""), BOT_FAMILY.other); // no UA is never a person
  assert.equal(botFamily("-"), BOT_FAMILY.other); // nginx writes "-" for absent
});

test("the ordering is load-bearing — 'Googlebot' contains 'bot'", () => {
  // A flat list would file every crawler under whichever pattern happened to be
  // first, and "Search engine" vs "Other bot" is the whole value of the card.
  assert.equal(botFamily("Googlebot/2.1"), BOT_FAMILY.search);
  assert.notEqual(botFamily("Googlebot/2.1"), BOT_FAMILY.other);
});

test("a browser is not a bot", () => {
  assert.equal(botFamily(CHROME), null);
  assert.equal(botFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1"), null);
});

test("a bot is counted, but only as a bot", () => {
  const hits = lineToHits(line("/", "curl/8.7.1"));
  // Counted — a crawler silently dropped is a gap you'd spend an afternoon on.
  assert.deepEqual(hits, [{ bucket: "2026-07-17T10", dimension: "bot", key: BOT_FAMILY.tool }]);
  // And nowhere else: path/browser/os/device describe people. Half the "Other"
  // in Browsers and OS was curl.
  assert.ok(!hits.some((h) => ["path", "browser", "os", "device"].includes(h.dimension)));
});

// ── the ceiling this is allowed to have ──────────────────────────────────────

test("nothing recorded can tell two visitors apart", () => {
  // The rule: separate *a* human from *not a* human, never one human from
  // another. Two different people on the same page produce byte-identical hits,
  // so no join is possible even in principle — there is nothing to join on.
  const a = lineToHits(
    `203.0.113.7 - - [17/Jul/2026:10:00:00 +0000] "GET /life HTTP/1.1" 200 512 "https://news.example/x" "${CHROME}"`,
  );
  const b = lineToHits(
    `198.51.100.9 - - [17/Jul/2026:10:00:00 +0000] "GET /life HTTP/1.1" 200 998 "https://news.example/x" "${CHROME}"`,
  );
  assert.deepEqual(a, b);

  // And nothing derived from a line carries the IP, the UA, or a session.
  const serialized = JSON.stringify(a);
  assert.ok(!serialized.includes("203.0.113.7"));
  assert.ok(!serialized.includes("Mozilla"));
  assert.ok(!serialized.includes("537.36"));
});

test("the bot family is a family, not an agent string", () => {
  // "Search engine", not the full Googlebot UA with its build and its URL.
  const hits = lineToHits(line("/", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"));
  assert.equal(hits[0]?.key, BOT_FAMILY.search);
  assert.ok(!JSON.stringify(hits).includes("google.com/bot.html"));
});
