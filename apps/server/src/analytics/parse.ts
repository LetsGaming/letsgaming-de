/**
 * Access-log parsing for analytics (§9). Pure and testable. The IP field is
 * deliberately never captured — only path, referrer host, and coarse UA family
 * survive, which is all the aggregates need. Nothing personal is derived.
 */

import type { AnalyticsHit } from "@lg/db";

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

/** "10/Oct/2026:13:55:36 +0000" -> "2026-10-10". */
function logDay(stamp: string): string | null {
  const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4})/.exec(stamp);
  if (!m) return null;
  const mon = MONTHS[m[2]!];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[1]}`;
}

function isPageView(method: string, status: number, path: string): boolean {
  if (method !== "GET") return false;
  if (status < 200 || status >= 400) return false;
  if (/^\/(_astro|_image|media|api|favicon|robots|sitemap)/.test(path)) return false;
  if (/\.(css|js|mjs|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|xml|txt|json)$/i.test(path))
    return false;
  return true;
}

function referrerHost(ref: string): string | null {
  if (!ref || ref === "-") return "direct";
  try {
    return new URL(ref).host || null;
  } catch {
    return null;
  }
}

/** Parse one log line into aggregate hits (or [] if it's not a page view). */
export function lineToHits(line: string, ownHost?: string): AnalyticsHit[] {
  const m = LINE.exec(line);
  if (!m) return [];
  const [, stamp, method, rawPath, statusStr, referrer, ua] = m;
  const day = logDay(stamp!);
  if (!day) return [];
  const path = (rawPath ?? "").split("?")[0] ?? "/";
  const status = Number(statusStr);
  if (!isPageView(method!, status, path)) return [];

  const hits: AnalyticsHit[] = [{ day, dimension: "path", key: path }];

  const host = referrerHost(referrer ?? "");
  if (host && host !== ownHost) hits.push({ day, dimension: "referrer", key: host });

  const { browser, os, device } = parseUserAgent(ua ?? "");
  hits.push({ day, dimension: "browser", key: browser });
  hits.push({ day, dimension: "os", key: os });
  hits.push({ day, dimension: "device", key: device });

  return hits;
}
