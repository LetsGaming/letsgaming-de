/**
 * Is this request a person, or a program?
 *
 * The rule this file works under: it may separate *a* human from *not a* human,
 * and it may never tell one human from another. So it reads a user-agent string,
 * throws it away, and keeps a word — never the string, never the IP, never a
 * fingerprint, never anything that could be joined across two requests. Nothing
 * here can answer "was this the same visitor as before", because nothing here
 * remembers a visitor.
 *
 * That's a deliberate ceiling, not an oversight. The moment you can say "these two
 * requests were the same person" you have built the thing GDPR is about, and you
 * have built it in the file whose comment says the IP is "deliberately never
 * captured".
 *
 * Two signals are available, and they fail in opposite directions:
 *
 * 1. **The user agent** (here). Catches every bot that admits to being one, which
 *    is most of the volume — Googlebot, uptime pings, `curl`, `python-requests`.
 *    Misses anything that lies. Cheap, and works on requests that never run JS.
 *
 * 2. **The beacon** (`track.ts`). A crawler doesn't run JavaScript, so an engaged
 *    visit is a browser almost by definition. Catches liars. Can't be joined back
 *    to a log line without an identifier, which is the whole point — so it's a
 *    second *count*, not a second opinion on the first.
 *
 * Neither is a verdict. Together they bracket the truth: page views are the
 * ceiling, engaged visits the floor, and the gap is JS-less humans plus bots that
 * lie. The dashboard shows both rather than inventing a number in between.
 */

/**
 * What a self-identifying non-human is called.
 *
 * A *family*, not the agent string: "Googlebot", not
 * "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)".
 * The families are coarse on purpose — the same reason `parseUserAgent` drops
 * versions. Knowing that search engines crawl you is useful; knowing which build
 * of curl someone ran is a detail about a person's machine.
 */
export const BOT_FAMILY = {
  search: "Search engine",
  social: "Social preview",
  monitor: "Uptime monitor",
  tool: "Script or tool",
  ai: "AI crawler",
  other: "Other bot",
} as const;
export type BotFamily = (typeof BOT_FAMILY)[keyof typeof BOT_FAMILY];

/**
 * Patterns, most specific first.
 *
 * Ordered because the generic `bot` catches almost everything below it —
 * "Googlebot" contains "bot" — so a flat list would file every crawler under
 * "Other bot" or not, depending on which regex happened to be first. Rule of
 * three's cousin: a list whose order is load-bearing needs to say so.
 *
 * The list is only ever as complete as the last log you read. These were added
 * after finding them in production being counted as people: `cohere-ai` and the
 * other AI crawlers match nothing containing "bot"; `PetalBot` was landing in
 * "Other" rather than search; and the generic rule said `monitoring`, which
 * misses every agent that calls itself `monitor-something`.
 */
export interface BotRule {
  id: string;
  family: BotFamily;
  test: RegExp;
}

export const BOT_RULES: readonly BotRule[] = [
  { id: "ua-search-engine", family: BOT_FAMILY.search, test: /googlebot|googleother|google-inspectiontool|storebot-google|adsbot-google|mediapartners-google|apis-google|bingbot|bingpreview|msnbot|yandex(bot)?|duckduckbot|baiduspider|slurp|applebot|petalbot|seznambot|qwantify|sogou|exabot|mojeek/ },
  { id: "ua-ai-crawler", family: BOT_FAMILY.ai, test: /gptbot|claudebot|anthropic|ccbot|perplexity|bytespider|google-extended|cohere|amazonbot|meta-externalagent|diffbot|omgili|timpibot|youbot|imagesift|oai-searchbot|chatgpt-user|claude-searchbot|claude-user|claude-web|amzn-|google-cloudvertexbot|duckassistbot|mistralai/ },
  { id: "ua-link-preview", family: BOT_FAMILY.social, test: /facebookexternalhit|twitterbot|slackbot|slack-imgproxy|discordbot|whatsapp|telegrambot|linkedinbot|embedly|pinterest|skype ?uri ?preview|vkshare|redditbot|iframely|bitlybot|tumblr|nuzzel|flipboard|cardyb|opengraph|linkpreview|google-read-aloud/ },
  { id: "ua-monitor", family: BOT_FAMILY.monitor, test: /uptimerobot|pingdom|statuscake|betteruptime|newrelic|datadog|site24x7|hetrixtool|uptime|nodeping|freshping|updown\.io|zabbix|nagios|prometheus|blackbox|monitis|checkly|statping|healthcheck|health-check|kube-probe|googlehc|gtmetrix|pagespeed|webpagetest/ },
  { id: "ua-headless", family: BOT_FAMILY.tool, test: /puppeteer|playwright|headless|phantom|selenium|webdriver|cypress|pa11y|jsdom|lighthouse/ },
  { id: "ua-http-library", family: BOT_FAMILY.tool, test: /curl|wget|python-requests|python-urllib|python-httpx|aiohttp|go-http-client|quic-go|fasthttp|colly|okhttp|axios|node-fetch|undici|libwww|libcurl|httpie|postman|insomnia|java\/|apache-httpclient|jakarta|scrapy|zgrab|masscan|nmap|censys|shodan|nuclei|reqwest|restsharp|guzzle|winhttp|powershell|\bperl\b|\bruby\b|\bphp\/|\bbun\/|\bdeno\// },
  { id: "ua-generic-bot", family: BOT_FAMILY.other, test: /bot\b|crawler|crawl|spider|scraper|feedfetcher|archiver|monitor|checker|validator|preview|^node$|^mozilla\/\d\.\d$/ },
  { id: "ua-tool-token", family: BOT_FAMILY.other, test: /scan|detect|extractor|pipeline|research|inspect|harvest|collector|enumerat|lightspeed|jetpack|\bcms\b/ },
];

/** Real browsers always name a platform; a UA with no Mozilla/ prefix and no platform token is a program. */
const PLATFORM_TOKEN = /windows|android|iphone|ipad|ios|mac os x|macintosh|linux|cros|x11|cpu os|bsd|sunos/;
export const NO_PLATFORM_RULE_ID = "ua-no-platform";
export const NO_AGENT_RULE_ID = "ua-empty";

export function hasPlatformlessAgent(ua: string): boolean {
  const s = ua.trim().toLowerCase();
  if (NO_AGENT.test(s)) return false;
  return !s.startsWith("mozilla/") && !PLATFORM_TOKEN.test(s);
}

/**
 * An empty or absent UA.
 *
 * nginx logs "-" when the client sent no User-Agent header. Every real browser
 * sends one; nothing that omits it is a person at a keyboard. It's the cheapest
 * true signal in the file.
 */
export const NO_AGENT = /^-?$/;

/**
 * Classify. Returns the bot family, or null for "could be a person".
 *
 * *Could be* — not "is". A browser-shaped UA is trivially forged, so this is a
 * ceiling on human traffic, never a confirmation of it. The beacon is the only
 * thing that confirms, and it does so without knowing who.
 */
export function botFamily(ua: string): BotFamily | null {
  const s = ua.trim().toLowerCase();
  if (NO_AGENT.test(s)) return BOT_FAMILY.other;
  for (const rule of BOT_RULES) {
    if (rule.test.test(s)) return rule.family;
  }
  return null;
}

/**
 * Where thresholds for "nobody runs this any more" live. A request from a browser
 * older than these in 2026 is a scan wave replaying a stale UA pool, not a person:
 * a scanner's pool is years old, a person's browser auto-updates. Raise the
 * numbers as the real floor moves; a human on one of these loses a log page view
 * only, never a confirmed visit (the beacon counts those).
 */
export const STALE_BROWSER_MIN = {
  /** Chrome, Chrome for iOS and Edge (Chromium major version). */
  chromium: 120,
  firefox: 115,
  /** Safari `Version/` on a UA with no Chrome and no Android token. */
  safari: 15,
  samsungInternet: 20,
  ucBrowser: 15,
  android: 8,
} as const;

const ANCIENT_PLATFORM = /msie |trident\/|presto\/|symbianos|blackberry|bb10|windows phone|nokia|midp|\bopera\/9/;

const majorOf = (s: string, re: RegExp): number | null => {
  const m = re.exec(s);
  return m ? Number(m[1]) : null;
};
const below = (v: number | null, min: number): boolean => v !== null && v < min;

export function isStaleBrowser(ua: string): boolean {
  const s = ua.trim().toLowerCase();
  if (ANCIENT_PLATFORM.test(s)) return true;
  const min = STALE_BROWSER_MIN;
  const samsung = majorOf(s, /samsungbrowser\/(\d+)/);
  if (samsung !== null) return samsung < min.samsungInternet;
  return (
    below(majorOf(s, /\b(?:chrome|crios|edg|edga|edgios)\/(\d+)/), min.chromium) ||
    below(majorOf(s, /\b(?:firefox|fxios)\/(\d+)/), min.firefox) ||
    below(majorOf(s, /ucbrowser\/(\d+)/), min.ucBrowser) ||
    below(majorOf(s, /android (\d+)/), min.android) ||
    (!/chrome|crios|android/.test(s) && below(majorOf(s, /\bversion\/(\d+)[\d.]* (?:mobile\/\S+ )?safari\//), min.safari))
  );
}

/**
 * Browsers that append a four-part `Name/a.b.c.d` token after `Safari/…`. Any other
 * such token is a tool announcing itself. Looser tokens (`Snapchat/12.0`,
 * `[FBAV/…]`) are in-app browsers and are left alone.
 */
const KNOWN_SUFFIX_PRODUCTS = new Set([
  "edg", "edga", "edgios", "opr", "opt", "vivaldi", "yabrowser", "duckduckgo", "whale",
  "miuibrowser", "huaweibrowser", "gsa", "line", "electron",
]);

function hasUnknownSuffixProduct(s: string): boolean {
  const m = /\bsafari\/[\d.]+\s+(.+)$/.exec(s);
  if (!m) return false;
  for (const token of m[1]!.split(/\s+/)) {
    const product = /^([a-z][a-z0-9_.-]*)\/\d+\.\d+\.\d+\.\d+$/.exec(token)?.[1];
    if (product && !KNOWN_SUFFIX_PRODUCTS.has(product)) return true;
  }
  return false;
}

/**
 * Structural checks on a browser-shaped UA. Real browsers send a fixed anatomy
 * (`Mozilla/5.0 (platform) engine (KHTML, like Gecko) Chrome/a.b.c.d Safari/x`);
 * the forged ones in scan waves are hand-assembled and get a part wrong.
 */
export interface UaHeuristic {
  id: string;
  family: BotFamily;
  matches: (ua: string) => boolean;
}

export const UA_HEURISTICS: readonly UaHeuristic[] = [
  {
    id: "ua-no-engine",
    family: BOT_FAMILY.other,
    matches: (ua) => {
      const s = ua.trim().toLowerCase();
      if (!s.startsWith("mozilla/")) return false;
      if (!/applewebkit\/|gecko|trident|presto/.test(s)) return true;
      return /applewebkit\//.test(s) && !/chrome\/|safari\/|version\/|mobile\/|crios\/|fxios\//.test(s);
    },
  },
  {
    id: "ua-malformed-webkit",
    family: BOT_FAMILY.other,
    matches: (ua) => {
      const s = ua.toLowerCase();
      return s.includes("applewebkit/") && !s.includes("khtml, like gecko");
    },
  },
  {
    id: "ua-malformed-chrome-version",
    family: BOT_FAMILY.other,
    matches: (ua) => /\bchrome\/(?!\d+\.\d+\.\d+\.\d+)/.test(ua.toLowerCase()),
  },
  { id: "ua-stale-browser", family: BOT_FAMILY.other, matches: isStaleBrowser },
  { id: "ua-embedded-url", family: BOT_FAMILY.other, matches: (ua) => /https?:\/\//i.test(ua) },
  {
    id: "ua-unknown-suffix",
    family: BOT_FAMILY.other,
    matches: (ua) => hasUnknownSuffixProduct(ua.trim().toLowerCase()),
  },
];
