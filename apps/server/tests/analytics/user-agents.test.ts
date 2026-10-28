import assert from "node:assert/strict";
import { test } from "node:test";
import { STALE_BROWSER_MIN, isStaleBrowser } from "../../src/analytics/agent.js";
import { classifyHit } from "../../src/analytics/classify.js";

const get = (ua: string) => classifyHit({ method: "GET", path: "/", status: 200, ua });

const chrome = (version: string, rest = "Safari/537.36") =>
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} ${rest}`;
const firefox = (v: number) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;

const SEARCH = "Search engine";
const AI = "AI crawler";
const TOOL = "Script or tool";
const OTHER = "Other bot";
const SOCIAL = "Social preview";

/** User agents seen passing as people in production scan waves. */
const BOTS: [ua: string, family: string][] = [
  ["Mozilla/5.0", OTHER],
  ["Mozilla/5.0 (X11; Linux x86_64)", OTHER],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0", OTHER],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", OTHER],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36", OTHER],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", OTHER],
  [chrome("124.0"), OTHER],
  [chrome("126"), OTHER],
  [`${chrome("131.0.0.0")} Agency/93.8.2357.5`, OTHER],
  [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko, Yokohama Institute of Information Security  https://www.iisec.ac.jp) Chrome/131.0.0.0 Safari/537.36",
    OTHER,
  ],
  ["Mozilla/5.0 (l9scan/2.0.33e27393e2431313e2838313; +https://leakix.net)", OTHER],
  ["Mozilla/5.0 CMS detector", OTHER],
  ["ModatScanner/1.2", OTHER],
  ["ctpipe/0.1", OTHER],
  ["Mozilla/5.0 (compatible; lightspeed)", OTHER],
  ["Bun/1.4.0", TOOL],
  ["Mozilla/5.0 (compatible; domainscan/1.0; +research)", OTHER],
  ["Mozilla/5.0 (compatible; lead-pipeline/1.0; CT-based domain research)", OTHER],
  ["CorporateDomainExtractor/1.0", OTHER],
  ["TargetRadar-Bestandsaufbau/1.0", OTHER],
  ["nameserver-checker-http-validator/1.0", OTHER],
  ["DefensiveOpenDirectoryResearchScanner/2.0", OTHER],
  ["metabase-cve-2026-72898-detect/1.0", OTHER],
  ["WPWatchBot/0.1", OTHER],
  ["dede-bot/1.0", OTHER],
  ["ApcosysBot/1.0", OTHER],
  ["Jetpack by WordPress.com", OTHER],
  ["Mediapartners-Google", SEARCH],
  ["Googlebot-Image/1.0", SEARCH],
  ["Google-CloudVertexBot", AI],
  ["Amzn-SearchBot", AI],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot", AI],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", AI],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +searchbot@anthropic.com)", AI],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", AI],
  ["Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", AI],
  ["Mozilla/5.0 (compatible;PetalBot;+https://webmaster.petalsearch.com/site/petalbot)", SEARCH],
  ["Mozilla/5.0 (compatible; DataForSeoBot/1.0; +https://dataforseo.com/dataforseo-bot)", OTHER],
  ["Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)", OTHER],
  ["Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", OTHER],
  ["Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)", OTHER],
  ["Mozilla/5.0 (compatible; CensysInspect/1.1; +https://about.censys.io/)", TOOL],
  ["Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)", SEARCH],
  ["Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", SEARCH],
  ["msnbot/2.0b (+http://search.msn.com/msnbot.htm)", SEARCH],
  ["Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", SEARCH],
  ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", SOCIAL],
  ["curl/8.21.0", TOOL],
  ["python-requests/2.32.5", TOOL],
  ["Go-http-client/2.0", TOOL],
  ["-", OTHER],
];

for (const [ua, family] of BOTS) {
  test(`bot user agent: ${ua.slice(0, 70)}`, () => {
    const v = get(ua);
    assert.equal(v.class, "bot");
    assert.equal(v.family, family);
  });
}

const HUMANS: Record<string, string> = {
  "Firefox 152 Windows": firefox(152),
  "Chrome 156 Windows": chrome("156.0.0.0"),
  "Edge 145": chrome("145.0.0.0", "Safari/537.36 Edg/145.0.0.0"),
  "Safari 26.5 macOS":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15",
  "Chrome iOS":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.0.0 Mobile/15E148 Safari/604.1",
  "Android reduced UA":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Pixel Chrome":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.6422.113 Mobile Safari/537.36",
  "Samsung Internet":
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  "Firefox ESR 115": firefox(115),
  "Chrome at the floor": chrome("120.0.0.0"),
  "In-app browser (Snapchat)": chrome("131.0.0.0", "Mobile Safari/537.36 Snapchat/12.0"),
  "iOS in-app webview":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

for (const [name, ua] of Object.entries(HUMANS)) {
  test(`stays a page view: ${name}`, () => {
    const v = get(ua);
    assert.equal(v.class, "pageview", `${v.rule}`);
  });
}

test("stale browser: ancient Chromium and Firefox builds seen in scan waves", () => {
  for (const v of [49, 60, 64, 68, 72, 74, 75, 76, 78, 79, 83, 88, 90, 92, 93, 96, 103, 107, 115, 119]) {
    assert.equal(get(chrome(`${v}.0.0.0`)).rule, "ua-stale-browser", `Chrome/${v}`);
  }
  for (const v of [4, 59, 108, 109]) {
    assert.equal(get(firefox(v)).rule, "ua-stale-browser", `Firefox/${v}`);
  }
});

test("stale browser: legacy engines and platforms", () => {
  for (const ua of [
    "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)",
    "Opera/9.80 (Windows NT 6.1; U; en) Presto/2.9.168 Version/11.50",
    "Mozilla/5.0 (SymbianOS/9.4; U; Series60/5.0 Nokia5800d-1/21.0.025) AppleWebKit/413 (KHTML, like Gecko) Safari/413",
    "BlackBerry9700/5.0.0.351 Profile/MIDP-2.1 Configuration/CLDC-1.1 VendorID/123",
    "Mozilla/5.0 (Linux; U; Android 8.1.0; en-US; Redmi 5A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/57.0.2987.108 UCBrowser/11.0.5.850 U3/0.8.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1 Safari/605.1.15",
  ]) {
    assert.equal(get(ua).class, "bot", ua);
  }
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 5.1.1; SM-G920F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1 Safari/605.1.15",
  ]) {
    assert.equal(get(ua).rule, "ua-stale-browser", ua);
  }
});

test("the stale thresholds sit exactly on their boundary", () => {
  assert.equal(isStaleBrowser(chrome(`${STALE_BROWSER_MIN.chromium - 1}.0.0.0`)), true);
  assert.equal(isStaleBrowser(chrome(`${STALE_BROWSER_MIN.chromium}.0.0.0`)), false);
  assert.equal(isStaleBrowser(firefox(STALE_BROWSER_MIN.firefox - 1)), true);
  assert.equal(isStaleBrowser(firefox(STALE_BROWSER_MIN.firefox)), false);
});
