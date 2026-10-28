import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "@lg/db";
import { BURST_RULE_ID, markBursts } from "../../src/analytics/burst.js";
import { ingestLog } from "../../src/analytics/ingest.js";
import { parseLine } from "../../src/analytics/parse.js";

/**
 * A condensed 2026-10 access log: real-human page views, scanner sweeps wearing
 * browser user agents, the proxy's HTTP to HTTPS pairs, write methods, query-string
 * probes, referrer tricks, dead links, and one scan burst with page views mixed in.
 * Addresses are the documentation address 203.0.113.7 throughout.
 *
 * Each line carries the rule expected to decide it. `+burst` marks a line that is a
 * page view on its own and is reclassified by its neighbours.
 */
const OWN = "letsgaming.de";
const lines = readFileSync(fileURLToPath(new URL("./fixtures/real-2026-10.access", import.meta.url)), "utf8")
  .split("\n")
  .filter(Boolean);

const EXPECTED: readonly string[] = [
  "pageview", // GET /
  "ignored-internal-path", // GET /_nuxt/entry.3f9a1c.js
  "ignored-internal-path", // GET /_nuxt/builds/meta/dev.json
  "pageview", // GET /about
  "pageview", // GET /code?lang=de
  "pageview", // GET /?lang=en
  "pageview", // GET /?utm_source=discord
  "pageview", // GET /
  "pageview", // GET /
  "pageview", // GET /about
  "pageview", // GET /play
  "ignored-internal-path", // GET /admin
  "ignored-preview", // GET /?preview=1
  "ignored-asset", // GET /robots.txt
  "ignored-asset", // GET /favicon.ico
  "ignored-internal-path", // GET /media/avatar.webp
  "ignored-asset", // GET /logo.png
  "ignored-status", // GET /
  "referer-self-http", // GET /
  "ignored-status", // GET /about
  "pageview", // GET /about
  "ignored-method", // OPTIONS /
  "probe-secrets-dotfile", // GET /.env
  "probe-secrets-dotfile", // GET /.git/config
  "probe-wordpress", // GET /wp-login.php
  "probe-wordpress", // POST /xmlrpc.php
  "probe-wordpress", // POST /wp-json/batch/v1
  "probe-query-wordpress", // POST /?rest_route=/batch/v1
  "http-post-page", // POST /
  "http-post-page", // POST /
  "ignored-internal-path", // POST /api/pulse
  "probe-query-php", // GET /?phpinfo=1
  "probe-query-wordpress", // GET /?rest_route=/
  "probe-query-lfi", // GET /?file=%2Ftmp%2Fsess_a7d49fc98768ad26489...
  "probe-query-lfi", // GET /?file=..%2F..%2F..%2F..%2F..%2F..%2F%2F...
  "probe-query-lfi", // GET /?page=..%2F..%2Fetc%2Fpasswd
  "probe-query-wordpress", // GET /?wpcbfdc18575
  "probe-query-lfi", // GET /?url=.env
  "probe-query-cloaker", // GET /?stream_uuid=2fd8bbe5-0e5d-477a-9092-b8...
  "http-head", // HEAD /
  "referer-spam", // GET /
  "referer-self-http", // GET /
  "referer-self-http", // GET /
  "ua-empty", // GET /
  "ua-generic-bot", // GET /
  "ua-no-engine", // GET /
  "ua-malformed-webkit", // GET /
  "ua-malformed-chrome-version", // GET /
  "ua-stale-browser", // GET /
  "ua-unknown-suffix", // GET /
  "ua-http-library", // GET /
  "ua-search-engine", // GET /
  "ua-ai-crawler", // GET /
  "ua-tool-token", // GET /
  "not-found", // GET /blog/
  "not-found", // GET /phpinfo
  "not-found", // GET /livewire/update
  "not-found", // GET /contact
  "pageview", // GET /
  "not-found", // GET /login
  "pageview+burst", // GET /
  "not-found", // GET /register
  "not-found", // GET /contact
  "not-found", // GET /forgot-password
  "not-found", // GET /password/reset
  "not-found", // GET /auth/login
  "pageview+burst", // GET /about
  "not-found", // GET /email/verify
  "not-found", // GET /two-factor-challenge
  "ignored-internal-path", // GET /admin/login
  "not-found", // GET /filament
  "not-found", // GET /nova
  "not-found", // GET /telescope
  "not-found", // GET /horizon
  "not-found", // GET /dashboard
  "not-found", // GET /billing
  "not-found", // GET /checkout
  "ignored-internal-path", // GET /_nuxt/entry.3f9a1c.js
  "pageview", // GET /
  "ignored-internal-path", // GET /_nuxt/entry.3f9a1c.css
];

const ruleOf = (i: number): string => EXPECTED[i]!.split("+")[0]!;
const isBurst = (i: number): boolean => EXPECTED[i]!.endsWith("+burst");

test("the fixture and the expectation table cover the same lines", () => {
  assert.equal(lines.length, EXPECTED.length);
  assert.ok(lines.length >= 60 && lines.length <= 80);
});

test("every line is decided by the expected rule", () => {
  lines.forEach((line, i) => {
    const parsed = parseLine(line, OWN);
    assert.ok(parsed, line);
    assert.equal(parsed.verdict.rule, ruleOf(i), line);
  });
});

test("only the page views inside the scan burst are reclassified", () => {
  const entries = lines.map((line) => {
    const p = parseLine(line, OWN)!;
    return { second: p.second, class: p.verdict.class };
  });
  const flags = markBursts(entries);
  lines.forEach((line, i) => assert.equal(flags[i], isBurst(i), line));
});

test("ingest counts each class once and no human page view is lost", () => {
  const store = openStore(":memory:");
  const file = join(tmpdir(), `lg-fixture-${process.pid}.log`);
  writeFileSync(file, lines.join("\n") + "\n");
  try {
    ingestLog(store, file, OWN);
    const traffic = Object.fromEntries(
      store.analytics.topHourly("traffic", "2026-10-26T00", "2026-10-26T23").map((r) => [r.key, r.count]),
    );
    const humans = EXPECTED.filter((r) => r === "pageview").length;
    assert.equal(traffic.pageview, humans);
    assert.equal(traffic.notfound, EXPECTED.filter((r) => r === "not-found").length);

    const exclusions = Object.fromEntries(
      store.analytics.topHourly("exclusion", "2026-10-26T00", "2026-10-26T23", 200).map((r) => [r.key, r.count]),
    );
    assert.equal(exclusions[BURST_RULE_ID], EXPECTED.filter((r) => r.endsWith("+burst")).length);

    const referrers = store.analytics
      .topHourly("referrer", "2026-10-26T00", "2026-10-26T23", 200)
      .reduce((n, r) => n + r.count, 0);
    assert.equal(referrers, humans, "the referrer list sums to the page views");
  } finally {
    rmSync(file, { force: true });
    store.close();
  }
});

test("nothing in the parsed output carries the address", () => {
  const all = lines.map((l) => JSON.stringify(parseLine(l, OWN))).join("\n");
  assert.ok(!all.includes("203.0.113.7"));
});
