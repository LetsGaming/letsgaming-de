/**
 * One ordered rule table decides what every counted log line is.
 *
 * First match wins, so the order below is the contract: ignored lines first (they
 * never reach a verdict), then probes by what was asked for, then bots by what
 * the user agent claims, then a page view. Every rule has a stable `id`; the id
 * is stored as the `exclusion` dimension so a removed request stays explainable.
 *
 * Reads only method, path, status and user agent. Nothing here can join two
 * requests to the same visitor.
 */

import {
  BOT_RULES,
  NO_AGENT,
  NO_AGENT_RULE_ID,
  NO_PLATFORM_RULE_ID,
  BOT_FAMILY,
  hasPlatformlessAgent,
} from "./agent.js";
import { PROBE_RULES, probeRuleFor } from "./probe.js";

export type HitClass = "probe" | "bot" | "pageview" | "ignored";

export interface HitInput {
  method: string;
  /** Request target; a query string is allowed and ignored. */
  path: string;
  status: number;
  ua: string;
  referrer?: string;
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

const isRedirectOrInfo = (status: number): boolean =>
  status < 200 || (status >= 300 && status < 400);

const botRules: ClassifyRule[] = BOT_RULES.map((r) => ({
  id: r.id,
  class: "bot",
  family: r.family,
  matches: (h) => r.test.test(h.ua.trim().toLowerCase()),
}));

/**
 * Redirects are the first half of the proxy's HTTP to HTTPS pair, so they are
 * dropped to leave one line per request. HEAD is let through the method check
 * because it is classified (as a bot) rather than ignored.
 */
export const CLASSIFY_RULES: readonly ClassifyRule[] = [
  { id: "ignored-method", class: "ignored", matches: (h) => h.method !== "GET" && h.method !== "HEAD" },
  { id: "ignored-status", class: "ignored", matches: (h) => isRedirectOrInfo(h.status) },
  { id: "ignored-internal-path", class: "ignored", matches: (h) => NOT_THE_SITE.test(h.pathOnly) },
  { id: "ignored-asset", class: "ignored", matches: (h) => ASSET_EXT.test(h.pathOnly) },
  { id: "ignored-preview", class: "ignored", matches: (h) => PREVIEW.test(h.path) },

  ...PROBE_RULES.map(
    (r): ClassifyRule => ({
      id: r.id,
      class: "probe",
      family: r.family,
      matches: (h) => probeRuleFor(h.pathOnly)?.id === r.id,
    }),
  ),

  { id: "http-head", class: "bot", family: BOT_FAMILY.tool, matches: (h) => h.method === "HEAD" },
  { id: NO_AGENT_RULE_ID, class: "bot", family: BOT_FAMILY.other, matches: (h) => NO_AGENT.test(h.ua.trim().toLowerCase()) },
  ...botRules,
  { id: NO_PLATFORM_RULE_ID, class: "bot", family: BOT_FAMILY.other, matches: (h) => hasPlatformlessAgent(h.ua) },

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
