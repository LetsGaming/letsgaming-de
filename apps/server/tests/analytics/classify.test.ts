import assert from "node:assert/strict";
import { test } from "node:test";
import { CLASSIFY_RULES, classifyHit, type HitInput } from "../../src/analytics/classify.js";
import { sourceOf } from "../../src/analytics/source.js";

const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const get = (path: string, ua: string, status = 200): HitInput => ({ method: "GET", path, status, ua });

const RULE_CASES: [rule: string, hit: HitInput, cls: string][] = [
  ["ignored-method", { method: "OPTIONS", path: "/", status: 200, ua: CHROME_WIN }, "ignored"],
  ["ignored-status", get("/", CHROME_WIN, 301), "ignored"],
  ["ignored-internal-path", get("/admin/pages", CHROME_WIN), "ignored"],
  ["ignored-asset", get("/logo.png", CHROME_WIN), "ignored"],
  ["ignored-preview", get("/?preview=1", CHROME_WIN), "ignored"],
  ["probe-admin-panel", get("/phpmyadmin/", CHROME_WIN, 404), "probe"],
  ["probe-wordpress", get("/wp-login.php", CHROME_WIN, 404), "probe"],
  ["probe-secrets-dotfile", get("/.env", CHROME_WIN, 404), "probe"],
  ["probe-secrets-file", get("/credentials", CHROME_WIN, 404), "probe"],
  ["probe-backup-file", get("/dump.sql", CHROME_WIN, 404), "probe"],
  ["probe-backup-dir", get("/backups/", CHROME_WIN, 404), "probe"],
  ["probe-shell-endpoint", get("/cgi-bin/luci", CHROME_WIN, 404), "probe"],
  ["probe-webshell", get("/wso.php", CHROME_WIN, 404), "probe"],
  ["probe-traversal", get("/static/..%2f..%2fetc/passwd", CHROME_WIN, 400), "probe"],
  ["probe-server-script", get("/index.asp", CHROME_WIN, 404), "probe"],
  ["probe-scanner-furniture", get("/vendor/phpunit/x", CHROME_WIN, 404), "probe"],
  ["probe-query-wordpress", get("/?rest_route=/", CHROME_WIN), "probe"],
  ["probe-query-php", get("/?phpinfo=1", CHROME_WIN), "probe"],
  ["probe-query-lfi", get("/?url=.env", CHROME_WIN), "probe"],
  ["probe-query-cloaker", get("/?stream_uuid=2fd8bbe5-0e5d-477a-9092-b802b11d75ad", CHROME_WIN), "probe"],
  ["http-post-page", { method: "POST", path: "/", status: 200, ua: CHROME_WIN }, "bot"],
  ["http-head", { method: "HEAD", path: "/", status: 200, ua: CHROME_WIN }, "bot"],
  ["ua-empty", get("/", "-"), "bot"],
  ["ua-search-engine", get("/", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), "bot"],
  ["ua-ai-crawler", get("/", "Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.1)"), "bot"],
  ["ua-link-preview", get("/", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"), "bot"],
  ["ua-monitor", get("/", "Mozilla/5.0 (compatible; UptimeRobot/2.0)"), "bot"],
  ["ua-headless", get("/", CHROME_WIN.replace("Chrome/", "HeadlessChrome/")), "bot"],
  ["ua-http-library", get("/", "python-requests/2.31.0"), "bot"],
  ["ua-generic-bot", get("/", "Mozilla/5.0 (compatible; SomeCrawler/1.0)"), "bot"],
  ["ua-no-platform", get("/", "Opera"), "bot"],
  ["ua-tool-token", get("/", "Mozilla/5.0 (l9scan/2.0; leakix)"), "bot"],
  ["ua-no-engine", get("/", "Mozilla/5.0 (X11; Linux x86_64)"), "bot"],
  ["ua-malformed-webkit", get("/", CHROME_WIN.replace("(KHTML, like Gecko) ", "")), "bot"],
  ["ua-malformed-chrome-version", get("/", CHROME_WIN.replace("Chrome/120.0.0.0", "Chrome/124.0")), "bot"],
  ["ua-stale-browser", get("/", CHROME_WIN.replace("Chrome/120.0.0.0", "Chrome/49.0.2623.112")), "bot"],
  ["ua-embedded-url", get("/", CHROME_WIN.replace("Gecko)", "Gecko, Institute https://example.org)")), "bot"],
  ["ua-unknown-suffix", get("/", `${CHROME_WIN} Agency/93.8.2357.5`), "bot"],
  ["referer-self-http", { ...get("/", CHROME_WIN), referrer: "http://letsgaming.de/", ownHost: "letsgaming.de" }, "bot"],
  ["referer-spam", { ...get("/", CHROME_WIN), referrer: "https://five.co.in/redirect.php?ref_host=x" }, "bot"],
  ["not-found", get("/typo", CHROME_WIN, 404), "notfound"],
  ["pageview", get("/work", CHROME_WIN), "pageview"],
  ["ignored-not-served", get("/typo", CHROME_WIN, 500), "ignored"],
];

for (const [rule, hit, cls] of RULE_CASES) {
  test(`rule ${rule}`, () => {
    const v = classifyHit(hit);
    assert.equal(v.rule, rule);
    assert.equal(v.class, cls);
  });
}

test("every rule in the table is covered by a case", () => {
  const covered = new Set(RULE_CASES.map(([r]) => r));
  const missing = CLASSIFY_RULES.map((r) => r.id).filter((id) => !covered.has(id));
  assert.deepEqual(missing, []);
});

test("rule ids are unique", () => {
  const ids = CLASSIFY_RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("headless and library agents map to the tool family", () => {
  for (const ua of [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
    "Mozilla/5.0 (Unknown; Linux x86_64) AppleWebKit/538.1 (KHTML, like Gecko) PhantomJS/2.1.1 Safari/538.1",
    "Mozilla/5.0 (Linux; Android 11) Chrome-Lighthouse",
    "curl/8.4.0",
    "Wget/1.21",
    "Go-http-client/2.0",
    "axios/1.6.0",
    "node-fetch/1.0",
    "okhttp/4.12.0",
    "libwww-perl/6.67",
    "Java/17.0.2",
    "Apache-HttpClient/4.5.14",
    "Python/3.11 aiohttp/3.9",
    "Scrapy/2.11 (+https://scrapy.org)",
  ]) {
    const v = classifyHit(get("/", ua));
    assert.equal(v.class, "bot", ua);
    assert.equal(v.family, "Script or tool", ua);
  }
});

test("link-preview fetchers map to the social family", () => {
  for (const ua of [
    "Discordbot/2.0 (+https://discordapp.com)",
    "WhatsApp/2.23.20 A",
    "TelegramBot (like TwitterBot)",
    "Twitterbot/1.0",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
    "Mozilla/5.0 (Windows NT 6.1) SkypeUriPreview Preview/0.5",
  ]) {
    assert.equal(classifyHit(get("/", ua)).family, "Social preview", ua);
  }
});

const REAL_BROWSERS: Record<string, string> = {
  "Chrome desktop": CHROME_WIN,
  "Chrome Linux": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Firefox desktop": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Firefox Linux": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Safari macOS": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Edge desktop": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Chrome Android": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Firefox Android": "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0",
  "Safari iPhone": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  "Safari iPad": "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  "Chrome iOS": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
  "Edge Android": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0",
  "Samsung Internet": "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
};

for (const [name, ua] of Object.entries(REAL_BROWSERS)) {
  test(`real browser is a page view: ${name}`, () => {
    const v = classifyHit(get("/work?tab=1", ua));
    assert.equal(v.class, "pageview");
    assert.equal(v.rule, "pageview");
  });
}

test("probe path beats a bot user agent", () => {
  assert.equal(classifyHit(get("/.env.bak", "Googlebot/2.1", 404)).class, "probe");
});

test("sourceOf maps referrer values to categories", () => {
  const cases: [string | null, string][] = [
    [null, "direct"],
    ["direct", "direct"],
    ["www.google.com", "search"],
    ["www.google.de", "search"],
    ["www.bing.com", "search"],
    ["duckduckgo.com", "search"],
    ["ecosia.org", "search"],
    ["search.brave.com", "search"],
    ["search.yahoo.com", "search"],
    ["old.reddit.com", "social"],
    ["out.reddit.com", "social"],
    ["x.com", "social"],
    ["t.co", "social"],
    ["twitter.com", "social"],
    ["l.facebook.com", "social"],
    ["instagram.com", "social"],
    ["www.youtube.com", "social"],
    ["twitch.tv", "social"],
    ["discord.com", "social"],
    ["linkedin.com", "social"],
    ["mastodon.social", "social"],
    ["bsky.app", "social"],
    ["utm:newsletter", "campaign"],
    ["utm:steam", "campaign"],
    ["utm:discord", "social"],
    ["utm:google", "search"],
    ["news.ycombinator.com", "referral"],
    ["example.com", "referral"],
    ["reddit.example.com", "referral"],
    ["foo.co.uk", "referral"],
  ];
  for (const [input, expected] of cases) assert.equal(sourceOf(input), expected, String(input));
});
