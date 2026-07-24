/**
 * Access-log parsing for analytics (§9). Pure and testable. The IP field is
 * deliberately never captured — only path, referrer host, and coarse UA family
 * survive, which is all the aggregates need. Nothing personal is derived.
 *
 * That constraint is also the ceiling on what this file can say about bots. With
 * no identifier there is nothing to correlate across requests, so a line is judged
 * on what it carries and nothing else: what it *claims* to be (agent.ts) and what
 * it *asked for* (probe.ts).
 */

import type { HourlyHit } from "@lg/db";
import { UTM_PREFIX, sanitizeUtmSource } from "@lg/core";
import { botFamily } from "./agent.js";
import { probeFamily } from "./probe.js";

export interface ParsedUA {
  browser: string;
  os: string;
  device: "mobile" | "desktop";
}

/** Coarse user-agent family. Intentionally low-resolution (no versions). */
export function parseUserAgent(ua: string): ParsedUA {
  const s = ua.toLowerCase();
  const browser = /edg\//.test(s)
    ? "Edge"
    : /firefox|fxios/.test(s)
      ? "Firefox"
      : /chrome|crios/.test(s) && !/edg\//.test(s)
        ? "Chrome"
        : /safari/.test(s) && !/chrome|crios/.test(s)
          ? "Safari"
          : "Other";
  const os = /windows/.test(s)
    ? "Windows"
    : /android/.test(s)
      ? "Android"
      : /iphone|ipad|ios/.test(s)
        ? "iOS"
        : /mac os x|macintosh/.test(s)
          ? "macOS"
          : /linux/.test(s)
            ? "Linux"
            : "Other";
  const device: "mobile" | "desktop" = /mobi|android|iphone|ipad/.test(s) ? "mobile" : "desktop";
  return { browser, os, device };
}

// Combined log format:
// IP - - [10/Oct/2026:13:55:36 +0000] "GET /path HTTP/1.1" 200 512 "ref" "ua"
const LINE =
  /^\S+ \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d{3}) \S+ "([^"]*)" "([^"]*)"/;

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** "10/Oct/2026:13:55:36 +0000" -> UTC hour bucket "2026-10-10T13". */
function logHour(stamp: string): string | null {
  const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?/.exec(stamp);
  if (!m) return null;
  const mon = MONTHS[m[2]!];
  if (!mon) return null;
  const tz = m[7] ? `${m[7].slice(0, 3)}:${m[7].slice(3)}` : "Z"; // +0200 -> +02:00
  const d = new Date(`${m[3]}-${mon}-${m[1]}T${m[4]}:${m[5]}:${m[6]}${tz}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 13);
}

/**
 * Paths that aren't the site.
 *
 * `/admin` is the new one and it was the loudest: the CMS and its editor canvas
 * were counted as page views, so opening the editor logged two — one for the
 * panel, one for the iframe — and the dashboard reported the owner reading his own
 * dashboard as traffic. Same reasoning as the `?preview=1` check below, which was
 * already here; the preview is the site, framed by the admin, and `/admin` is the
 * admin itself.
 */
const NOT_THE_SITE = /^\/(admin|_nuxt|_image|media|api|favicon|robots|sitemap)(\/|$)/;
const ASSET_EXT = /\.(css|js|mjs|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|xml|txt|json)$/i;

/**
 * Is this line worth classifying at all?
 *
 * Deliberately looser than "was a page served", because a request that *failed*
 * still says something: a scanner sweeping for `/.env.bak` gets a 404, and that
 * 404 is the entire security signal. Filtering on success first is what made the
 * probe counts vanish — the noise was excluded before anything could name it.
 *
 * **Redirects are dropped here, and that's the important part.** The reverse
 * proxy upgrades HTTP to HTTPS with a 301, so every request writes two lines: the
 * 301, then the real 200 or 404. Counting both double-counts every visit and
 * every probe. Dropping 3xx leaves exactly one line per request, and loses
 * nothing — a redirect that leads somewhere is followed by a request for the
 * destination, and that request is the event.
 */
function isCountable(method: string, status: number, path: string): boolean {
  if (method !== "GET") return false;
  // 3xx is the redirect half of a pair; 1xx never reaches here.
  if (status < 200 || (status >= 300 && status < 400)) return false;
  if (NOT_THE_SITE.test(path)) return false;
  if (ASSET_EXT.test(path)) return false;
  return true;
}

/** Was a page actually served? Only then is it a page view. */
const wasServed = (status: number): boolean => status >= 200 && status < 300;

/** `utm_source` (or the shorter aliases) from a raw request target. */
function taggedSource(rawPath: string): string | null {
  const q = rawPath.indexOf("?");
  if (q === -1) return null;
  const params = new URLSearchParams(rawPath.slice(q + 1));
  for (const key of ["utm_source", "ref", "from", "source"]) {
    const hit = sanitizeUtmSource(params.get(key));
    if (hit) return hit;
  }
  return null;
}

function referrerHost(ref: string): string | null {
  if (!ref || ref === "-") return "direct";
  try {
    return new URL(ref).host || null;
  } catch {
    return null;
  }
}

/** Parse one log line into aggregate hourly hits (or [] if not a page view). */
export function lineToHits(line: string, ownHost?: string): HourlyHit[] {
  const m = LINE.exec(line);
  if (!m) return [];
  const [, stamp, method, rawPath, statusStr, referrer, ua] = m;
  const bucket = logHour(stamp!);
  if (!bucket) return [];
  // The CMS preview loads the site with ?preview=1 — never count those as visits.
  if (/[?&]preview=1(?:&|$)/.test(rawPath ?? "")) return [];
  const path = (rawPath ?? "").split("?")[0] ?? "/";
  const status = Number(statusStr);
  if (!isCountable(method!, status, path)) return [];

  // What it *asked for*, before what it *claims to be*.
  //
  // The path is the harder signal to forge: a user agent is a string anyone can
  // type, and the logs show secret-hunting sweeps arriving as "Googlebot" and
  // "Applebot" asking for `/.env.bak` and `/api/config`. A real Googlebot does
  // not do that. Checking the agent first filed those under "Search engine",
  // which is both wrong and flattering.
  //
  // Scanners that don't bother lying are caught here too: they send a plain
  // Chrome user-agent, so before this existed they landed in `path`, `browser`,
  // `os` and `device` as "Chrome on Windows" and buried the real traffic.
  const probe = probeFamily(path);
  if (probe) return [{ bucket, dimension: "probe", key: probe }];

  // A request that says it isn't a person is counted, and counted separately.
  //
  // Not dropped: knowing that search engines crawl you, or that an uptime monitor
  // hits you every minute, is worth seeing — and a bot silently discarded is a
  // gap you'd spend an afternoon explaining. But it doesn't belong in `path`,
  // `browser`, `os` or `device`, because those exist to describe *people* and a
  // crawler answers all four with noise. Half this dashboard's "Other" was curl.
  const family = botFamily(ua ?? "");
  if (family) return [{ bucket, dimension: "bot", key: family }];

  // Anything left that didn't get a page is not a page view. A human hitting a
  // typo'd URL and getting a 404 is a real person, but they didn't read a page,
  // and their browser/OS shouldn't pad the split either.
  if (!wasServed(status)) return [];

  const hits: HourlyHit[] = [{ bucket, dimension: "path", key: path }];

  // Where they came from: the link's own tag first, the `Referer` header second.
  //
  // The tag wins because it's the one that survives. Native apps hand a URL to
  // the browser with no previous page, so a visit from the Discord or Steam
  // client arrives header-less and indistinguishable from someone typing the
  // address. A `?utm_source=` on the link answers anyway. When there's no tag
  // this falls back to exactly what it did before.
  const tagged = taggedSource(rawPath ?? "");
  const host = referrerHost(referrer ?? "");
  if (tagged) {
    hits.push({ bucket, dimension: "referrer", key: `${UTM_PREFIX}${tagged}` });
  } else if (host && host !== ownHost) {
    hits.push({ bucket, dimension: "referrer", key: host });
  }

  const { browser, os, device } = parseUserAgent(ua ?? "");
  hits.push({ bucket, dimension: "browser", key: browser });
  hits.push({ bucket, dimension: "os", key: os });
  hits.push({ bucket, dimension: "device", key: device });

  return hits;
}
