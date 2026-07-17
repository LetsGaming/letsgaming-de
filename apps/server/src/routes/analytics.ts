/**
 * Analytics read + maintenance API (authed). Serves the aggregates the CMS
 * dashboard shows, and lets the owner clear ranges. Read-only over anonymous
 * counts — there's nothing personal to expose or protect.
 *
 * Two stores: log-derived stats are day-bucketed (`analytics_daily`); engagement
 * is hour-bucketed (`analytics_hourly`) so the graph can show hourly resolution
 * and the owner can clear fine-grained ranges (last hour, last 3 days, …).
 */

import { clearRange } from "@lg/core";
import type { AnalyticsResponse, ClearAnalyticsResponse } from "@lg/core";
import type { AnalyticsDimension, Store } from "@lg/db";
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

export function registerAnalyticsRoutes(app: FastifyInstance, store: Store, env: ServerEnv): void {
  app.get<{ Querystring: { hours?: string } }>(
    "/api/cms/analytics",
    { preHandler: requireAuth(env) },
    async (req) => {
      const hours = Math.min(24 * 400, Math.max(1, Number(req.query.hours) || 720));
      const unit: "hour" | "day" = hours <= 72 ? "hour" : "day";
      const now = new Date();
      const fromB = isoHour(new Date(now.getTime() - (hours - 1) * HOUR));
      const toB = isoHour(now);

      const top = (d: AnalyticsDimension) => store.analytics.topHourly(d, fromB, toB);
      const series = (d: AnalyticsDimension) => store.analytics.seriesHourly(d, fromB, toB, unit);

      const response: AnalyticsResponse = {
        range: { from: fromB, to: toB, hours, unit },
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
