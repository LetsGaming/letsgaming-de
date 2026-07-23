/**
 * Analytics read + maintenance API (authed). Serves the aggregates the CMS
 * dashboard shows, and lets the owner clear ranges. Read-only over anonymous
 * counts — there's nothing personal to expose or protect.
 *
 * Two stores: log-derived stats are day-bucketed (`analytics_daily`); engagement
 * is hour-bucketed (`analytics_hourly`) so the graph can show hourly resolution
 * and the owner can clear fine-grained ranges (last hour, last 3 days, …).
 */

import { clearRange, sanitizeTimeZone } from "@lg/core";
import type { AnalyticsResponse, AnalyticsTotals, ClearAnalyticsResponse } from "@lg/core";
import { zonedParts, type AnalyticsDimension, type SeriesRow, type Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { requireAuth } from "../auth/guard.js";
import { badRequest } from "../errors.js";

const HOUR = 3600_000;

/**
 * Bounds that sort outside every real bucket, for "clear everything".
 *
 * Buckets are ISO prefixes (`2026-07-17T14`, `2026-07-17`) compared as text, so
 * "before all of them" is any string that sorts below a leading digit-4 year, and
 * "after all of them" any that sorts above. Named because `"0000"` and `"9999"`
 * appearing bare in a DELETE range read like typos.
 */
const BUCKET_MIN = "0000";
const BUCKET_MAX = "9999";

function isoHour(d: Date): string {
  return d.toISOString().slice(0, 13);
}

/**
 * How far a zone's wall clock runs ahead of UTC at a given instant, in ms.
 *
 * Derived by reading the wall clock and re-parsing it *as if* it were UTC; the
 * difference is the offset. `zonedParts` resolves to the hour, so the instant is
 * floored to the hour before comparing — otherwise the minutes would show up as
 * a bogus sub-hour offset.
 */
function zoneOffsetMs(atMs: number, timeZone: string): number {
  const p = zonedParts(atMs, timeZone);
  const asIfUtc = Date.parse(`${p.day}T${String(p.hour).padStart(2, "0")}:00:00Z`);
  return asIfUtc - Math.floor(atMs / HOUR) * HOUR;
}

/**
 * The UTC instant at which a local calendar day begins.
 *
 * Two passes: the offset that applies at the naive guess may not be the one that
 * applies at the answer — on a DST changeover the clock moves between them — so
 * the second pass re-derives it at the corrected instant.
 */
function localDayStartMs(day: string, timeZone: string): number {
  const wall = Date.parse(`${day}T00:00:00Z`);
  const first = wall - zoneOffsetMs(wall, timeZone);
  return wall - zoneOffsetMs(first, timeZone);
}

/**
 * Re-bucket hourly rows into the reader's local calendar days.
 *
 * SQLite can group by `substr(bucket,1,10)`, but that is a *UTC* day, and a day
 * boundary is a wall-clock fact: in Europe/Berlin the 22:00 and 23:00 UTC hours
 * belong to the next local day. Grouping in SQL would put them in the wrong
 * column and no amount of relabelling fixes it. Done here in JS with `zonedParts`
 * — the same DST-exact helper the playtime heatmap buckets with — over rows the
 * process already holds from a local SQLite read.
 */
function toLocalDays(rows: SeriesRow[], timeZone: string, from: string, to: string): SeriesRow[] {
  const merged = new Map<string, number>();
  for (const r of rows) {
    const day = zonedParts(Date.parse(`${r.bucket}:00:00Z`), timeZone).day;
    if (day < from || day > to) continue;
    const k = `${day}\u0000${r.key}`;
    merged.set(k, (merged.get(k) ?? 0) + r.count);
  }
  return [...merged.entries()].map(([k, count]) => {
    const [bucket, key] = k.split("\u0000");
    return { bucket: bucket!, key: key!, count };
  });
}

/**
 * The lower bound to query with, given the bucket unit.
 *
 * Buckets are stored per hour and compared as text. A day-unit query groups by
 * `substr(bucket,1,10)` but still filters on the raw hour string, so a bound of
 * `2026-06-17T10` excludes `2026-06-17T00`…`T09` — the first day of the range
 * came back missing every hour before the current hour-of-day. Nothing failed:
 * the client draws that day as a full day, so the oldest column was quietly
 * short by up to 23/24 of itself, by an amount that changed with the time of day
 * the dashboard happened to be open.
 *
 * Flooring to the start of the day makes the queried window match the window the
 * chart claims to be showing.
 */
function fromBucket(from: Date, unit: "hour" | "day"): string {
  return unit === "day" ? `${from.toISOString().slice(0, 10)}T00` : isoHour(from);
}

export function registerAnalyticsRoutes(app: FastifyInstance, store: Store, env: ServerEnv): void {
  app.get<{ Querystring: { hours?: string; tz?: string } }>(
    "/api/cms/analytics",
    { preHandler: requireAuth(env) },
    async (req) => {
      const hours = Math.min(24 * 400, Math.max(1, Number(req.query.hours) || 720));
      const unit: "hour" | "day" = hours <= 72 ? "hour" : "day";
      // Defaults to the owner's zone, not UTC: the dashboard's only reader is the
      // owner, and "yesterday evening" should mean their evening.
      const timeZone = sanitizeTimeZone(req.query.tz);
      const now = new Date();

      // The window, and the window immediately before it for the comparison.
      const windowStart = new Date(now.getTime() - (hours - 1) * HOUR);
      const prevEnd = new Date(windowStart.getTime() - HOUR);
      const prevStart = new Date(prevEnd.getTime() - (hours - 1) * HOUR);

      let fromB: string;
      let toB: string;
      let prevFromB: string;
      let prevToB: string;
      if (unit === "day") {
        // Whole local days: the axis draws day columns, so the window has to
        // start at a local midnight or the oldest column is a partial day drawn
        // as a full one.
        const firstDay = zonedParts(windowStart.getTime(), timeZone).day;
        fromB = isoHour(new Date(localDayStartMs(firstDay, timeZone)));
        toB = isoHour(now);
        const prevFirstDay = zonedParts(prevStart.getTime(), timeZone).day;
        prevFromB = isoHour(new Date(localDayStartMs(prevFirstDay, timeZone)));
        prevToB = isoHour(prevEnd);
      } else {
        fromB = isoHour(windowStart);
        toB = isoHour(now);
        prevFromB = isoHour(prevStart);
        prevToB = isoHour(prevEnd);
      }

      // Day buckets are local days; hour buckets stay UTC and only their labels
      // shift client-side.
      const rangeFrom = unit === "day" ? zonedParts(Date.parse(`${fromB}:00:00Z`), timeZone).day : fromB;
      const rangeTo = unit === "day" ? zonedParts(now.getTime(), timeZone).day : toB;

      const top = (d: AnalyticsDimension) => store.analytics.topHourly(d, fromB, toB);
      const series = (d: AnalyticsDimension) => {
        const rows = store.analytics.seriesHourly(d, fromB, toB, unit === "day" ? "hour" : "hour");
        return unit === "day" ? toLocalDays(rows, timeZone, rangeFrom, rangeTo) : rows;
      };
      const sumOf = (d: AnalyticsDimension, from: string, to: string) =>
        store.analytics.topHourly(d, from, to).reduce((s, r) => s + r.count, 0);

      const previous: AnalyticsTotals = {
        pageviews: sumOf("path", prevFromB, prevToB),
        sections: sumOf("tab", prevFromB, prevToB),
        clicks: sumOf("click", prevFromB, prevToB),
        visitLength: sumOf("session_dwell", prevFromB, prevToB),
        bots: sumOf("bot", prevFromB, prevToB),
      };
      const hasPrevious = Object.values(previous).some((v) => v > 0);

      const response: AnalyticsResponse = {
        range: { from: rangeFrom, to: rangeTo, hours, unit, timeZone },
        // Log-derived top lists (now hour-bucketed, same pipeline).
        paths: top("path"),
        referrers: top("referrer"),
        browsers: top("browser"),
        os: top("os"),
        devices: top("device"),
        bots: top("bot"),
        // The graph: stacked composition over time, per metric.
        chart: {
          unit,
          pageviews: series("path"),
          sections: series("tab"),
          clicks: series("click"),
          visitLength: series("session_dwell"),
          bots: series("bot"),
        },
        // Omitted rather than zeroed when the previous window predates any data,
        // so the UI can say "no comparison" instead of "down 100%".
        ...(hasPrevious ? { previous } : {}),
        // Engagement top lists (hour-bucketed).
        engagement: {
          tabs: top("tab"),
          exits: top("exit"),
          transitions: top("transition"),
          dwell: top("dwell"),
          scroll: top("scroll"),
          sessionTabs: top("session_tabs"),
          sessionDwell: top("session_dwell"),
          clicks: top("click"),
          projects: top("project"),
          viewport: top("viewport"),
          theme: top("theme"),
        },
      };
      return response;
    },
  );

  // Clear a range. Fine-grained ranges target engagement (hour-bucketed);
  // "all" also wipes the log-derived day stats.
  //
  // The window comes from CLEAR_RANGES, which the CMS's buttons are built from
  // too. It used to be a switch that re-derived each window by hand — `back(72)`
  // for "3d" — beside a client list that said 72 for the same id. Two lists, one
  // meaning, and the failure mode is deleting the wrong window with no undo.
  app.post<{ Body: { range?: string } }>(
    "/api/cms/analytics/clear",
    { preHandler: requireAuth(env) },
    async (req) => {
      const range = clearRange(req.body?.range ?? "");
      if (!range) throw badRequest("Unknown range.");

      const now = new Date();
      const toB = isoHour(now);

      // `hours: null` is the un-windowed one: everything, both tables. The bucket
      // strings are lexicographic, so these bounds sort outside any real bucket.
      const removed =
        range.hours === null
          ? store.analytics.clearHourly(BUCKET_MIN, BUCKET_MAX) +
            store.analytics.clearDaily(BUCKET_MIN, BUCKET_MAX)
          : store.analytics.clearHourly(isoHour(new Date(now.getTime() - (range.hours - 1) * HOUR)), toB);

      const cleared: ClearAnalyticsResponse = { ok: true, removed };
      return cleared;
    },
  );
}
