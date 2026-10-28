/**
 * One ordered rule table decides what every counted log line is.
 *
 * First match wins, so the order below is the contract: ignored lines first (they
 * never reach a verdict), then probes by what was asked for, then bots by what
 * the request claims (method, user agent, referrer), then a not-found, then a
 * page view. Every rule has a stable `id`; the id is stored as the `exclusion`
 * dimension so a removed request stays explainable.
 *
 * Reads only method, path, query, status, user agent and referrer. Nothing here
 * can join two requests to the same visitor. The one rule that looks beyond a
 * single line, `burst-adjacent`, uses log timestamps alone (see burst.ts).
 */

import {
  BOT_RULES,
  NO_AGENT,
  NO_AGENT_RULE_ID,
  NO_PLATFORM_RULE_ID,
  BOT_FAMILY,
  UA_HEURISTICS,
  hasPlatformlessAgent,
} from "./agent.js";
import { PROBE_RULES, probeRuleFor } from "./probe.js";

export type HitClass = "probe" | "bot" | "pageview" | "notfound" | "ignored";

export interface HitInput {
  method: string;
  /** Request target; the query string is part of it and is read by probe rules. */
  path: string;
  status: number;
  ua: string;
  referrer?: string;
  /** The site's own hostname (a port is ignored), for judging the referrer. */
  ownHost?: string;
}

export interface Classification {
  class: HitClass;
  family?: string;
  rule: string;
}

export interface ClassifyRule {
  id: string;
  class: HitClass;
  family?: string;
  matches: (hit: HitInput & { pathOnly: string }) => boolean;
}

/**
 * Paths that aren't the site. `/admin` is the CMS itself; the preview iframe is
 * the site framed by the admin and is excluded via `?preview=1`.
 */
const NOT_THE_SITE = /^\/(admin|_nuxt|_image|media|api|favicon|robots|sitemap)(\/|$)/;
const ASSET_EXT = /\.(css|js|mjs|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|xml|txt|json)$/i;
const PREVIEW = /[?&]preview=1(?:&|$)/;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Referrers that only scanners send. A site-wide referrer spam host is cheaper to
 * list than to infer; add a host here the day it shows up in a log.
 */
export const REFERRER_SPAM_HOSTS: readonly string[] = ["five.co.in"];

const isRedirectOrInfo = (status: number): boolean =>
  status < 200 || (status >= 300 && status < 400);

const hostnameOf = (host: string): string => host.toLowerCase().replace(/:\d+$/, "");

function parseReferrer(ref: string | undefined): URL | null {
  if (!ref || ref === "-") return null;
  try {
    return new URL(ref);
  } catch {
    return null;
  }
}

/**
 * The proxy redirects HTTP to HTTPS, so a browser can only arrive with a
 * plain-http Referer naming this site by following a redirect it was handed by a
 * script, never by clicking a link on the https site.
 */
function isSelfHttpReferrer(h: HitInput): boolean {
  if (!h.ownHost) return false;
  const url = parseReferrer(h.referrer);
  return !!url && url.protocol === "http:" && url.hostname.toLowerCase() === hostnameOf(h.ownHost);
}

function isSpamReferrer(h: HitInput): boolean {
  const url = parseReferrer(h.referrer);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  return REFERRER_SPAM_HOSTS.some((spam) => host === spam || host.endsWith(`.${spam}`));
}

const botRules: ClassifyRule[] = BOT_RULES.map((r) => ({
  id: r.id,
  class: "bot",
  family: r.family,
  matches: (h) => r.test.test(h.ua.trim().toLowerCase()),
}));

const heuristicRules: ClassifyRule[] = UA_HEURISTICS.map((r) => ({
  id: r.id,
  class: "bot",
  family: r.family,
  matches: (h) => r.matches(h.ua),
}));

/**
 * Redirects are the first half of the proxy's HTTP to HTTPS pair, so they are
 * dropped to leave one line per request. HEAD and the write methods are let
 * through the method check because they are classified (as probes or bots)
 * rather than ignored; only methods nothing legitimate uses on a page (OPTIONS,
 * CONNECT, TRACE) are dropped there.
 */
export const CLASSIFY_RULES: readonly ClassifyRule[] = [
  {
    id: "ignored-method",
    class: "ignored",
    matches: (h) => h.method !== "GET" && h.method !== "HEAD" && !WRITE_METHODS.has(h.method),
  },
  { id: "ignored-status", class: "ignored", matches: (h) => isRedirectOrInfo(h.status) },
  { id: "ignored-internal-path", class: "ignored", matches: (h) => NOT_THE_SITE.test(h.pathOnly) },
  { id: "ignored-asset", class: "ignored", matches: (h) => ASSET_EXT.test(h.pathOnly) },
  { id: "ignored-preview", class: "ignored", matches: (h) => PREVIEW.test(h.path) },

  ...PROBE_RULES.map(
    (r): ClassifyRule => ({
      id: r.id,
      class: "probe",
      family: r.family,
      matches: (h) => probeRuleFor(h.path)?.id === r.id,
    }),
  ),

  { id: "http-post-page", class: "bot", family: BOT_FAMILY.tool, matches: (h) => WRITE_METHODS.has(h.method) },
  { id: "http-head", class: "bot", family: BOT_FAMILY.tool, matches: (h) => h.method === "HEAD" },
  { id: NO_AGENT_RULE_ID, class: "bot", family: BOT_FAMILY.other, matches: (h) => NO_AGENT.test(h.ua.trim().toLowerCase()) },
  ...botRules,
  { id: NO_PLATFORM_RULE_ID, class: "bot", family: BOT_FAMILY.other, matches: (h) => hasPlatformlessAgent(h.ua) },
  ...heuristicRules,
  { id: "referer-self-http", class: "bot", family: BOT_FAMILY.other, matches: isSelfHttpReferrer },
  { id: "referer-spam", class: "bot", family: BOT_FAMILY.other, matches: isSpamReferrer },

  { id: "not-found", class: "notfound", matches: (h) => h.status === 404 || h.status === 410 },
  { id: "pageview", class: "pageview", matches: (h) => h.status >= 200 && h.status < 300 },
  { id: "ignored-not-served", class: "ignored", matches: () => true },
];

export function classifyHit(hit: HitInput): Classification {
  const input = { ...hit, pathOnly: hit.path.split("?")[0] ?? "/" };
  for (const rule of CLASSIFY_RULES) {
    if (rule.matches(input)) {
      return rule.family
        ? { class: rule.class, family: rule.family, rule: rule.id }
        : { class: rule.class, rule: rule.id };
    }
  }
  return { class: "ignored", rule: "ignored-not-served" };
}
