/**
 * Analytics read API (authed). Serves the aggregates the CMS dashboard shows.
 * Read-only over anonymous counts — there's nothing personal to expose.
 */

import type { AnalyticsDimension, Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { requireAuth } from "../auth/guard.js";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function registerAnalyticsRoutes(app: FastifyInstance, store: Store, env: ServerEnv): void {
  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/cms/analytics",
    { preHandler: requireAuth(env) },
    async (req) => {
      const to = req.query.to ?? isoDay(new Date());
      const from =
        req.query.from ?? isoDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)); // 30 days
      const dim = (d: AnalyticsDimension) => store.analytics.top(d, from, to);
      return {
        range: { from, to },
        // Log-derived (unchanged).
        paths: dim("path"),
        referrers: dim("referrer"),
        browsers: dim("browser"),
        os: dim("os"),
        devices: dim("device"),
        trend: store.analytics.trend("path", from, to),
        // Engagement (cookieless beacon).
        engagement: {
          tabs: dim("tab"),
          exits: dim("exit"),
          transitions: dim("transition"),
          dwell: dim("dwell"),
          scroll: dim("scroll"),
          sessionTabs: dim("session_tabs"),
          sessionDwell: dim("session_dwell"),
          clicks: dim("click"),
          theme: dim("theme"),
        },
      };
    },
  );
}
