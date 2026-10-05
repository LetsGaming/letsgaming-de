import assert from "node:assert/strict";
import { test } from "node:test";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@lg/db";
import { botFamily } from "../../src/analytics/agent.js";
import { ingestLog } from "../../src/analytics/ingest.js";
import { lineToHits, pairHitsOf } from "../../src/analytics/parse.js";

const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const line = (path: string, ref: string, ua: string, status = 200) =>
  `1.2.3.4 - - [10/Oct/2026:13:00:00 +0000] "GET ${path} HTTP/2.0" ${status} 500 "${ref}" "${ua}"`;

test("a page view writes every pair among its dimensions", () => {
  const pairs = pairHitsOf(lineToHits(line("/work", "https://www.bing.com/", CHROME_WIN), "letsgaming.de"));
  assert.equal(pairs.length, 10);
  assert.ok(pairs.some((p) => p.dimension === "x:path:referrer" && p.key === "/work\u0001www.bing.com"));
  assert.ok(pairs.every((p) => p.bucket === "2026-10-10T13"));
});

test("an internal navigation has no referrer, so its pairs skip that dimension", () => {
  const pairs = pairHitsOf(lineToHits(line("/work", "https://letsgaming.de/", CHROME_WIN), "letsgaming.de"));
  assert.equal(pairs.length, 6);
  assert.ok(pairs.every((p) => !p.dimension.includes("referrer")));
});

test("bots and probes write no pairs", () => {
  assert.deepEqual(pairHitsOf(lineToHits(line("/work", "-", "curl/8.0"))), []);
  assert.deepEqual(pairHitsOf(lineToHits(line("/.env", "-", CHROME_WIN, 404))), []);
});

test("ingest stores pairs beside the counters and does not count them as hits", () => {
  const store = openStore(":memory:");
  const file = join(tmpdir(), `lg-pairs-${process.pid}.log`);
  writeFileSync(file, [line("/docs/a", "https://www.bing.com/", CHROME_WIN), ""].join("\n"));
  try {
    const r = ingestLog(store, file, "letsgaming.de");
    assert.equal(r.hits, 5);
    assert.deepEqual(store.analytics.topCross("referrer", ["www.bing.com"], "path", "2026-10-10T00", "2026-10-10T23"), [
      { key: "/docs/a", count: 1 },
    ]);
  } finally {
    rmSync(file, { force: true });
  }
});

test("headless, uptime, link-preview and library agents are not people", () => {
  const cases: [string, string][] = [
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36", "Script or tool"],
    ["Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0)", "Search engine"],
    ["Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)", "Uptime monitor"],
    ["Uptime-Kuma/1.23.0", "Uptime monitor"],
    ["kube-probe/1.28", "Uptime monitor"],
    ["Mozilla/5.0 (compatible; Zabbix)", "Uptime monitor"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:38.0) Gecko/20100101 Firefox/38.0 (Skype URI Preview)", "Social preview"],
    ["Mozilla/5.0 (compatible; redditbot/1.0)", "Social preview"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Selenium/4.1 Chrome/120", "Script or tool"],
    ["python-httpx/0.27.0", "Script or tool"],
    ["aiohttp/3.9.1", "Script or tool"],
    ["Mozilla/5.0 (compatible; Nmap Scripting Engine)", "Script or tool"],
    ["Mozilla/5.0", "Other bot"],
    ["node", "Other bot"],
  ];
  for (const [ua, family] of cases) assert.equal(botFamily(ua), family, ua);
});

test("ordinary browsers and in-app browsers stay people", () => {
  const people = [
    CHROME_WIN,
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 Snapchat/12.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  ];
  for (const ua of people) assert.equal(botFamily(ua), null, ua);
});
