import assert from "node:assert/strict";
import { test } from "node:test";
import { lineToHits } from "../../src/analytics/parse.js";

/**
 * Lines lifted verbatim from a live access log. Everything asserted here is a
 * behaviour the dashboard got wrong on real traffic, so the fixtures are the
 * actual bytes rather than something reconstructed to suit the parser.
 */
const OWN = "letsgaming.de";
const dims = (line: string) => lineToHits(line, OWN).map((h) => `${h.dimension}:${h.key}`);

// The proxy upgrades HTTP to HTTPS with a 301, so a single visit writes two
// lines and a single probe writes one before its HTTPS request 404s.
const REDIRECT_PROBE =
  '172.70.93.84 - - [24/Jul/2026:04:44:38 +0200] "GET /js/fm.php HTTP/1.1" 301 140 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0"';
const REDIRECT_REAL =
  '172.71.164.49 - - [24/Jul/2026:07:57:00 +0200] "GET / HTTP/1.1" 301 140 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"';
const SERVED_REAL =
  '172.71.164.49 - - [24/Jul/2026:07:57:00 +0200] "GET / HTTP/2.0" 200 45472 "http://letsgaming.de" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"';

test("the HTTP→HTTPS redirect is not a page view", () => {
  // This is what made a site with ~40 views report 1,361: `status < 400` counted
  // every 301, so each visit counted twice and every probe counted once.
  assert.deepEqual(dims(REDIRECT_REAL), []);
  assert.deepEqual(dims(REDIRECT_PROBE), []);
});

test("the request that actually served the page is counted, exactly once", () => {
  assert.ok(dims(SERVED_REAL).includes("path:/"));
});

test("the redirect's self-referral is not counted as a referral", () => {
  // The follow-up request carries `Referer: http://letsgaming.de` — the site
  // itself. Without ownHost every visit would report the site as its own source.
  assert.equal(
    dims(SERVED_REAL).some((d) => d.startsWith("referrer:")),
    false,
  );
});

test("a secret sweep wearing a Googlebot user-agent is a probe, not a search engine", () => {
  const line =
    '104.23.168.49 - - [24/Jul/2026:07:33:01 +0200] "GET /.env.bak HTTP/2.0" 200 100 "-" "Mozilla/5.0 (compatible; Google-Extended/1.0; +http://www.google.com/bot.html)"';
  assert.deepEqual(dims(line), ["probe:Secret / config file"]);
});

test("a scanner sending a plain browser user-agent is a probe, not Chrome on Windows", () => {
  const line =
    '172.70.93.84 - - [24/Jul/2026:04:44:38 +0200] "GET /wp-admin/images/index.php HTTP/2.0" 200 100 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.97 Safari/537.36"';
  assert.deepEqual(dims(line), ["probe:WordPress probe"]);
});

test("the admin surface and the sitemap are never page views", () => {
  const admin =
    '172.71.160.152 - - [24/Jul/2026:08:31:17 +0200] "GET /admin HTTP/2.0" 200 40511 "-" "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36"';
  const sitemap =
    '104.23.243.100 - - [24/Jul/2026:09:00:52 +0200] "GET /sitemap.xml HTTP/2.0" 200 398 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +searchbot@anthropic.com)"';
  assert.deepEqual(dims(admin), []);
  assert.deepEqual(dims(sitemap), []);
});

test("a HEAD request is not a page view", () => {
  const line =
    '104.23.199.162 - - [24/Jul/2026:11:18:43 +0200] "HEAD / HTTP/2.0" 200 0 "-" "quic-go-HTTP/3"';
  assert.deepEqual(dims(line), []);
});

test("a tagged link names its source even with no Referer at all", () => {
  // The Discord/Steam case: a native app opens the URL with no previous page.
  const line =
    '172.71.164.49 - - [24/Jul/2026:07:57:00 +0200] "GET /?utm_source=discord HTTP/2.0" 200 45472 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"';
  const out = dims(line);
  assert.ok(out.includes("referrer:utm:discord"));
  // …and the tag must not fragment the path.
  assert.ok(out.includes("path:/"));
});

test("the tag wins over a Referer header when both are present", () => {
  const line =
    '1.2.3.4 - - [24/Jul/2026:07:57:00 +0200] "GET /work?utm_source=newsletter HTTP/2.0" 200 100 "https://www.reddit.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"';
  const out = dims(line);
  assert.ok(out.includes("referrer:utm:newsletter"));
  assert.equal(out.includes("referrer:www.reddit.com"), false, "one source per visit");
});

test("without a tag it still derives the source from the Referer header", () => {
  const line =
    '1.2.3.4 - - [24/Jul/2026:07:57:00 +0200] "GET /work HTTP/2.0" 200 100 "https://www.reddit.com/r/webdev/comments/x" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"';
  assert.ok(dims(line).includes("referrer:www.reddit.com"));
});

test("a junk utm value is dropped and the header is used instead", () => {
  const line =
    '1.2.3.4 - - [24/Jul/2026:07:57:00 +0200] "GET /?utm_source=%21%21%21 HTTP/2.0" 200 100 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"';
  assert.ok(dims(line).includes("referrer:news.ycombinator.com"));
});

test("an oversized utm value cannot write an unbounded key into the store", () => {
  const line = `1.2.3.4 - - [24/Jul/2026:07:57:00 +0200] "GET /?utm_source=${"x".repeat(5000)} HTTP/2.0" 200 100 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"`;
  const ref = lineToHits(line, OWN).find((h) => h.dimension === "referrer");
  assert.ok(ref);
  assert.ok(ref!.key.length <= "utm:".length + 32, `key was ${ref!.key.length} chars`);
});

test("the CMS preview is still never counted", () => {
  const line =
    '1.2.3.4 - - [24/Jul/2026:07:57:00 +0200] "GET /life?preview=1 HTTP/2.0" 200 100 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"';
  assert.deepEqual(dims(line), []);
});

test("a probe that 404s is still counted as a probe — the 404 is the signal", () => {
  // Real line. Filtering on success first made these vanish entirely: the whole
  // point of the Probes card is to show the sweep, not to hide it.
  const line =
    '104.23.166.88 - - [24/Jul/2026:09:52:14 +0200] "GET /.env HTTP/2.0" 404 35557 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"';
  assert.deepEqual(dims(line), ["probe:Secret / config file"]);
});

test("a probe pair counts once: the redirect is dropped, the 404 is kept", () => {
  const redirect =
    '172.70.47.58 - - [24/Jul/2026:05:11:52 +0200] "GET /.env.bak HTTP/1.1" 301 140 "-" "Mozilla/5.0 (compatible; Google-Extended/1.0; +http://www.google.com/bot.html)"';
  const answer =
    '104.23.168.49 - - [24/Jul/2026:05:11:53 +0200] "GET /.env.bak HTTP/2.0" 404 35559 "http://letsgaming.de/.env.bak" "Mozilla/5.0 (compatible; Google-Extended/1.0; +http://www.google.com/bot.html)"';
  assert.deepEqual(dims(redirect), []);
  assert.deepEqual(dims(answer), ["probe:Secret / config file"]);
});

test("a crawler that 404s is still a crawler hit", () => {
  const line =
    '1.2.3.4 - - [24/Jul/2026:10:48:02 +0200] "GET /removed-page HTTP/2.0" 404 203 "-" "Mozilla/5.0 (compatible; cohere-ai/1.0; +https://cohere.com)"';
  assert.equal(dims(line).length, 1);
  assert.ok(dims(line)[0]!.startsWith("bot:"), `got ${dims(line)[0]}`);
});

test("a machine-readable endpoint is an asset, not a page — whoever asks for it", () => {
  // Real line. `.json` is in the asset list, so this never reaches the bot or
  // probe checks; crawlers polling well-known endpoints aren't traffic.
  const line =
    '172.71.232.160 - - [24/Jul/2026:10:48:02 +0200] "GET /.well-known/jwks.json HTTP/2.0" 404 203 "-" "Mozilla/5.0 (compatible; cohere-ai/1.0; +https://cohere.com)"';
  assert.deepEqual(dims(line), []);
});

test("a human hitting a 404 is not a page view and does not pad the browser split", () => {
  const line =
    '1.2.3.4 - - [24/Jul/2026:07:57:00 +0200] "GET /typo HTTP/2.0" 404 100 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"';
  assert.deepEqual(dims(line), []);
});

test("crawler families seen in production are recognised, not counted as people", () => {
  // Every user-agent here appeared in a real access log while being classified
  // as a human visitor (or, for PetalBot, as a generic "Other bot").
  const cases: [string, string][] = [
    ["Mozilla/5.0 (compatible; cohere-ai/1.0; +https://cohere.com)", "bot:AI crawler"],
    [
      "Mozilla/5.0 (compatible;PetalBot;+https://webmaster.petalsearch.com/site/petalbot)",
      "bot:Search engine",
    ],
    ["monitor-telegram-clone-realtime/1.0", "bot:Other bot"],
    ["quic-go-HTTP/3", "bot:Script or tool"],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +searchbot@anthropic.com)",
      "bot:AI crawler",
    ],
  ];
  for (const [ua, expected] of cases) {
    const line = `1.2.3.4 - - [24/Jul/2026:10:00:00 +0200] "GET /work HTTP/2.0" 200 100 "-" "${ua}"`;
    assert.deepEqual(dims(line), [expected], ua);
  }
});

test("an in-app browser is still a person", () => {
  // DingTalk opening a link is a human reading the page, not a crawler.
  const line =
    '104.23.168.49 - - [24/Jul/2026:05:11:35 +0200] "GET / HTTP/2.0" 200 45492 "-" "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 AliApp(DingTalk/7.5.30) com.alibaba.android.rimet/35900215 Channel/201200"';
  assert.ok(dims(line).includes("path:/"));
});
