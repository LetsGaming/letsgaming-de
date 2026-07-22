/**
 * Shared parsing for the `/day` drill-in routes (`/api/music/day`,
 * `/api/playtime/day`).
 *
 * Both routes took the same two query params and resolved them the same way,
 * including the same fallback rule and the same comment. Duplicated validation is
 * the kind that drifts quietly: tighten the day format in one route and the other
 * keeps accepting what you just rejected. The rule lives here once instead.
 */

import { isValidTimeZone, sanitizeTimeZone } from "@lg/core";

/** `YYYY-MM-DD`, the only day format the drill endpoints accept. */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDay(day: string | undefined): day is string {
  return typeof day === "string" && DAY_RE.test(day);
}

/**
 * The zone a requested day is interpreted in: the caller's if it's a real zone,
 * otherwise the owner's (`TZ`). This has to match however the strip that was
 * clicked bucketed its columns, or the drill-in shows a different day than the one
 * the visitor pointed at.
 */
export function resolveZone(tz: string | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : sanitizeTimeZone(process.env.TZ);
}
