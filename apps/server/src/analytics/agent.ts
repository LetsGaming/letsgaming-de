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
 */
const BOT_PATTERNS: readonly (readonly [RegExp, BotFamily])[] = [
  [/googlebot|bingbot|yandex(bot)?|duckduckbot|baiduspider|slurp|applebot/, BOT_FAMILY.search],
  [/gptbot|claudebot|anthropic|ccbot|perplexity|bytespider|google-extended/, BOT_FAMILY.ai],
  [/facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|linkedinbot|embedly|pinterest/, BOT_FAMILY.social],
  [/uptimerobot|pingdom|statuscake|betteruptime|newrelic|datadog|site24x7|hetrixtool/, BOT_FAMILY.monitor],
  [/curl|wget|python-requests|python-urllib|go-http-client|okhttp|axios|node-fetch|libwww|httpie|postman|insomnia|java\/|apache-httpclient|scrapy|puppeteer|playwright|headlesschrome|phantomjs|lighthouse/, BOT_FAMILY.tool],
  [/bot\b|crawler|crawl|spider|scraper|feedfetcher|archiver|monitoring|checker|validator|preview/, BOT_FAMILY.other],
];

/**
 * An empty or absent UA.
 *
 * nginx logs "-" when the client sent no User-Agent header. Every real browser
 * sends one; nothing that omits it is a person at a keyboard. It's the cheapest
 * true signal in the file.
 */
const NO_AGENT = /^-?$/;

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
  for (const [pattern, family] of BOT_PATTERNS) {
    if (pattern.test(s)) return family;
  }
  return null;
}
