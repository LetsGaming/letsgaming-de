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
import { DIRECT_REFERRER, UTM_PREFIX, isPairedDimension, pairEntries, sanitizeUtmSource, type PairedDimension } from "@lg/core";
import { BURST_CLASSIFICATION } from "./burst.js";
import { classifyHit, type Classification } from "./classify.js";
import { sourceOf } from "./source.js";

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

/** "10/Oct/2026:13:55:36 +0000" -> the instant it names. */
function logInstant(stamp: string): Date | null {
  const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?/.exec(stamp);
  if (!m) return null;
  const mon = MONTHS[m[2]!];
  if (!mon) return null;
  const tz = m[7] ? `${m[7].slice(0, 3)}:${m[7].slice(3)}` : "Z"; // +0200 -> +02:00
  const d = new Date(`${m[3]}-${mon}-${m[1]}T${m[4]}:${m[5]}:${m[6]}${tz}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

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

const hostnameOf = (host: string): string => host.toLowerCase().replace(/:\d+$/, "");

/** The referring host, or `direct` for no usable referrer (absent, `-`, or unparseable). */
function referrerHost(ref: string): string {
  if (!ref || ref === "-") return DIRECT_REFERRER;
  try {
    return new URL(ref).hostname || DIRECT_REFERRER;
  } catch {
    return DIRECT_REFERRER;
  }
}

/**
 * The pair counters for one page view's hits, so a filter on one dimension can
 * narrow the others. Only page views have pairs: bot and probe hits carry no path,
 * browser, OS or device, so they return none.
 */
export function pairHitsOf(hits: readonly HourlyHit[]): HourlyHit[] {
  const first = hits[0];
  if (!first || first.dimension !== "path") return [];
  const values: Partial<Record<PairedDimension, string>> = {};
  for (const h of hits) if (isPairedDimension(h.dimension)) values[h.dimension] = h.key;
  return pairEntries(values).map((e) => ({ bucket: first.bucket, ...e }));
}

export interface ParsedLine {
  /** Log timestamp in whole seconds since the epoch. */
  second: number;
  bucket: string;
  verdict: Classification;
  hits: HourlyHit[];
}

/** The hits a page view becomes once burst-adjacent has reclassified it. */
export function burstHitsOf(line: ParsedLine): HourlyHit[] {
  return botOrProbeHits(line.bucket, BURST_CLASSIFICATION);
}

function botOrProbeHits(bucket: string, verdict: Classification): HourlyHit[] {
  return [
    { bucket, dimension: verdict.class as "probe" | "bot", key: verdict.family! },
    { bucket, dimension: "exclusion", key: verdict.rule },
    { bucket, dimension: "traffic", key: verdict.class },
  ];
}

/**
 * Judge one log line on its own. `null` means the line isn't combined-format; an
 * ignored line parses fine and has no hits.
 */
export function parseLine(line: string, ownHost?: string): ParsedLine | null {
  const m = LINE.exec(line);
  if (!m) return null;
  const [, stamp, method, rawPath, statusStr, referrer, ua] = m;
  const instant = logInstant(stamp!);
  if (!instant) return null;
  const bucket = instant.toISOString().slice(0, 13);
  const second = Math.floor(instant.getTime() / 1000);
  const status = Number(statusStr);
  const verdict = classifyHit({
    method: method!,
    path: rawPath ?? "/",
    status,
    ua: ua ?? "",
    referrer: referrer ?? "",
    ...(ownHost ? { ownHost } : {}),
  });
  if (verdict.class === "ignored") return { second, bucket, verdict, hits: [] };

  // Probes and bots are counted but kept out of the dimensions that describe
  // people. The path is judged before the user agent because scanners forge the
  // latter; `exclusion` keeps the rule id so the reason stays visible.
  if (verdict.class === "probe" || verdict.class === "bot") {
    return { second, bucket, verdict, hits: botOrProbeHits(bucket, verdict) };
  }

  // A dead link is counted, nothing more: it describes no one.
  if (verdict.class === "notfound") {
    return {
      second,
      bucket,
      verdict,
      hits: [
        { bucket, dimension: "exclusion", key: verdict.rule },
        { bucket, dimension: "traffic", key: "notfound" },
      ],
    };
  }

  const path = (rawPath ?? "").split("?")[0] ?? "/";
  const hits: HourlyHit[] = [{ bucket, dimension: "path", key: path }];

  // Where they came from: the link's own tag first, the `Referer` header second.
  //
  // The tag wins because it's the one that survives. Native apps hand a URL to
  // the browser with no previous page, so a visit from the Discord or Steam
  // client arrives header-less and indistinguishable from someone typing the
  // address. A `?utm_source=` on the link answers anyway. The site's own host
  // (internal navigation, language switch) is filed as `direct` rather than
  // dropped, so the referrer list always sums to the page views.
  const tagged = taggedSource(rawPath ?? "");
  const host = referrerHost(referrer ?? "");
  const own = ownHost ? hostnameOf(ownHost) : undefined;
  const referrerKey = tagged ? `${UTM_PREFIX}${tagged}` : host === own ? DIRECT_REFERRER : host;
  hits.push({ bucket, dimension: "referrer", key: referrerKey });
  hits.push({ bucket, dimension: "traffic", key: "pageview" });
  hits.push({ bucket, dimension: "source", key: sourceOf(referrerKey) });

  const { browser, os, device } = parseUserAgent(ua ?? "");
  hits.push({ bucket, dimension: "browser", key: browser });
  hits.push({ bucket, dimension: "os", key: os });
  hits.push({ bucket, dimension: "device", key: device });

  return { second, bucket, verdict, hits };
}

/**
 * Parse one log line into aggregate hourly hits (or [] if it isn't counted).
 * Judges the line alone; `ingest.ts` adds the timestamp-window rule on top.
 */
export function lineToHits(line: string, ownHost?: string): HourlyHit[] {
  return parseLine(line, ownHost)?.hits ?? [];
}
