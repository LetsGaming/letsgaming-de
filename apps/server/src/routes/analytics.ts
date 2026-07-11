/**
 * Analytics read + maintenance API (authed). Serves the aggregates the CMS
 * dashboard shows, and lets the owner clear ranges. Read-only over anonymous
 * counts — there's nothing personal to expose or protect.
 *
 * Two stores: log-derived stats are day-bucketed (`analytics_daily`); engagement
 * is hour-bucketed (`analytics_hourly`) so the graph can show hourly resolution
 * and the owner can clear fine-grained ranges (last hour, last 3 days, …).
 */

import type { AnalyticsDimension, Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { requireAuth } from "../auth/guard.js";
import { badRequest } from "../errors.js";

const HOUR = 3600_000;
function isoHour(d: Date): string {
  return d.toISOString().slice(0, 13);
}
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
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

      return {
        range: { from: fromB, to: toB, hours, unit },
        // Log-derived top lists (now hour-bucketed, same pipeline).
        paths: top("path"),
        referrers: top("referrer"),
        browsers: top("browser"),
        os: top("os"),
        devices: top("device"),
        // The graph: stacked composition over time, per metric.
        chart: {
          unit,
          pageviews: series("path"),
          sections: series("tab"),
          clicks: series("click"),
          visitLength: series("session_dwell"),
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
    },
  );

  // Clear a range. Fine-grained ranges target engagement (hour-bucketed);
  // "all" also wipes the log-derived day stats.
  app.post<{ Body: { range?: string } }>(
    "/api/cms/analytics/clear",
    { preHandler: requireAuth(env) },
    async (req, reply) => {
      const range = req.body?.range ?? "";
      const now = new Date();
      const toB = isoHour(now);
      const back = (h: number) => isoHour(new Date(now.getTime() - (h - 1) * HOUR));

      let removed = 0;
      switch (range) {
        case "hour":
          removed = store.analytics.clearHourly(toB, toB);
          break;
        case "24h":
          removed = store.analytics.clearHourly(back(24), toB);
          break;
        case "3d":
          removed = store.analytics.clearHourly(back(72), toB);
          break;
        case "7d":
          removed = store.analytics.clearHourly(back(168), toB);
          break;
        case "all":
          removed =
            store.analytics.clearHourly("0000", "9999") +
            store.analytics.clearDaily("0000", "9999");
          break;
        default:
          throw badRequest("Unknown range.");
      }
      return { ok: true, removed };
    },
  );
}
