/**
 * Burst-adjacent: a page view that lands in the middle of a scan.
 *
 * Scanners interleave one successful `GET /` with dozens of probe and 404 lines
 * in the same second, rotating user agents and Cloudflare edge addresses, so no
 * per-line rule can tell it from a visit. What gives it away is the company it
 * keeps: a person doesn't coincide with three or more probes or dead links within
 * a few seconds.
 *
 * This uses log timestamps only, counted across all clients. It never reads an IP
 * or any identifier, so it cannot say who sent a line, only that the log was busy
 * with attacks at that moment. It is deliberately cheap: confirmed human visits
 * come from the beacon, so a real visitor who happens to coincide with a scan
 * loses a log page view, never a confirmed visit.
 */

import { BOT_FAMILY } from "./agent.js";
import type { Classification, HitClass } from "./classify.js";

/** Other probe or not-found lines needed within the window to condemn a page view. */
export const BURST_MIN = 3;
/** Half-width of the window in seconds, applied before and after the page view. */
export const BURST_WINDOW_SECONDS = 10;

export const BURST_RULE_ID = "burst-adjacent";

export const BURST_CLASSIFICATION: Classification = {
  class: "bot",
  family: BOT_FAMILY.other,
  rule: BURST_RULE_ID,
};

export interface BurstEntry {
  /** Log timestamp in whole seconds since the epoch. */
  second: number;
  class: HitClass;
}

const lowerBound = (sorted: readonly number[], x: number): number => {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * For each entry, whether it is a page view that sits inside a burst. Entries may
 * be in any order; the result is index-aligned with the input.
 */
export function markBursts(entries: readonly BurstEntry[]): boolean[] {
  const signals = entries
    .filter((e) => e.class === "probe" || e.class === "notfound")
    .map((e) => e.second)
    .sort((a, b) => a - b);
  return entries.map((e) => {
    if (e.class !== "pageview") return false;
    const inWindow =
      lowerBound(signals, e.second + BURST_WINDOW_SECONDS + 1) -
      lowerBound(signals, e.second - BURST_WINDOW_SECONDS);
    return inWindow >= BURST_MIN;
  });
}
