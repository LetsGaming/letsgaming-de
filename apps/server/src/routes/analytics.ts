/**
 * Analytics read + maintenance API (authed). Serves the aggregates the CMS
 * dashboard shows, and lets the owner clear ranges. Read-only over anonymous
 * counts — there's nothing personal to expose or protect.
 *
 * Headline figures and lists are read from the materialized rollups
 * (`analytics_summary`, `analytics_rollup`): hour grain for ranges up to 72 hours,
 * Berlin-day grain above, with the still-open bucket topped up from
 * `analytics_hourly`. A day range in another zone, and every dimension-filtered
 * view, read the hourly rows directly (retention bound). Deltas compare two
 * equal-length, non-overlapping windows and are computed here, not in the client.
 */

import {
  ANALYTICS_DIMENSIONS,
  MAX_CUSTOM_RANGE_DAYS,
  METRIC_SOURCES,
  SESSION_TAB_BUCKETS,
  classifyReferrer,
  clearRange,
  groupPathSeries,
  groupPaths,
  groupReferrers,
  isPairedDimension,
  pathMatchesFilter,
  sanitizeTimeZone,
  secondPageFigure,
} from "@lg/core";
import type {
  AnalyticsCardId,
  AnalyticsResponse,
  AnalyticsResponseFull,
  AnalyticsRow,
  AnalyticsTotals,
  ClearAnalyticsResponse,
  PairedDimension,
} from "@lg/core";
import { ROLLUP_TIME_ZONE, bucketDay, type AnalyticsDimension, type Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { requireAuth } from "../auth/guard.js";
import { badRequest } from "../errors.js";
import { headlineBlock, qualityBlock, sectionsBlock, sourcesBlock, windowFigures } from "../analytics/blocks.js";
import { createReader, toLocalDays } from "../analytics/reader.js";
import { rollupRange } from "../analytics/rollup.js";
import { bucketWindow, buildWindows } from "../analytics/window.js";

const HOUR = 3600_000;

/** The page-view lists a filter on another page-view dimension can narrow, and the dimension each shows. */
const CROSS_CARDS: Record<"paths" | "referrers" | "browsers" | "os" | "devices", PairedDimension> = {
  paths: "path",
  referrers: "referrer",
  browsers: "browser",
  os: "os",
  devices: "device",
};

/** Sub-paths listed under one expandable path group. */
const MAX_PATH_CHILDREN = 50;

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
  app.get<{
    Querystring: { hours?: string; tz?: string; at?: string; from?: string; to?: string; dim?: string; key?: string };
  }>(
    "/api/cms/analytics",
    { preHandler: requireAuth(env) },
    async (req) => {
      /**
       * A dimension filter — the click on a row in the CMS ("Referrer: Bing").
       * Both-or-neither, like `from`/`to`: a lone `dim` or `key` is a broken
       * request, not a partial one, and a hand-typed deep link with a typo'd
       * `dim` must fail loudly rather than silently render as unfiltered.
       *
       * It replaces what the chart plots and what one headline total counts, and
       * narrows the other access-log lists through the pair counters. The script's
       * `engagement` lists can't be crossed: see `AnalyticsResponse.filtered`.
       */
      const dim = (ANALYTICS_DIMENSIONS as readonly string[]).includes(req.query.dim ?? "")
        ? (req.query.dim as AnalyticsDimension)
        : null;
      const filterKey = typeof req.query.key === "string" && req.query.key.length > 0 && req.query.key.length <= 200
        ? req.query.key
        : null;
      if (Boolean(req.query.dim ?? req.query.key) && !(dim && filterKey)) {
        throw badRequest("A filter needs a valid 'dim' and a 'key', both.");
      }

      /**
       * An arbitrary `from`/`to` span — the "Custom" range picker — as an
       * alternative to the fixed `hours` presets. Both sides are required
       * together: a lone `from` or `to` reads as a broken request, not a
       * partial one, so it's rejected rather than silently guessed at.
       *
       * Always whole local calendar days (like the `unit === "day"` case
       * below), which is why there's no hour-level custom range: a picker
       * fine enough for "3:00 to 3:00" would need to explain itself, and the
       * preset ranges already cover every sub-day window worth having.
       */
      const dateShape = /^\d{4}-\d{2}-\d{2}$/;
      const customFrom = dateShape.test(req.query.from ?? "") ? req.query.from! : null;
      const customTo = dateShape.test(req.query.to ?? "") ? req.query.to! : null;
      if (Boolean(req.query.from ?? req.query.to) && !(customFrom && customTo)) {
        throw badRequest("A custom range needs a valid 'from' and 'to' (YYYY-MM-DD), both.");
      }
      if (customFrom && customTo && customFrom > customTo) {
        throw badRequest("'from' must not be after 'to'.");
      }
      const customSpanDays =
        customFrom && customTo
          ? Math.round((Date.parse(`${customTo}T00:00:00Z`) - Date.parse(`${customFrom}T00:00:00Z`)) / HOUR / 24) + 1
          : null;
      if (customSpanDays !== null && customSpanDays > MAX_CUSTOM_RANGE_DAYS) {
        throw badRequest(`A custom range can't exceed ${MAX_CUSTOM_RANGE_DAYS} days.`);
      }

      const hours =
        customSpanDays !== null ? customSpanDays * 24 : Math.min(24 * 400, Math.max(1, Number(req.query.hours) || 720));
      const unit: "hour" | "day" = customFrom ? "day" : hours <= 72 ? "hour" : "day";
      // Defaults to the owner's zone, not UTC: the dashboard's only reader is the
      // owner, and "yesterday evening" should mean their evening.
      const timeZone = sanitizeTimeZone(req.query.tz);
      const now = new Date();

      /**
       * A single bucket to narrow the LISTS to: what the dashboard sends when
       * you click a column in the chart. The chart and totals always cover the
       * full range; only the list cards and their totals use the bucket window.
       *
       * Validated by shape, not trusted: `YYYY-MM-DD` or `YYYY-MM-DDTHH`, and
       * anything else is ignored rather than concatenated into a bucket string.
       */
      const at = /^\d{4}-\d{2}-\d{2}(T\d{2})?$/.test(req.query.at ?? "") ? req.query.at! : null;

      // The range and the equal-length range immediately before it (never overlapping).
      const windows = buildWindows({
        now,
        hours,
        unit,
        timeZone,
        custom: customFrom && customTo ? { from: customFrom, to: customTo } : null,
      });
      const { current, previous: previousWin } = windows;
      const fromB = current.fromB;
      const toB = current.toB;
      const reader = createReader(store, unit, timeZone);

      // The lists and their totals narrow to the clicked bucket; the chart
      // above them doesn't.
      const listWin = at ? bucketWindow(at, timeZone) : current;
      const listFromB = listWin.fromB;
      const listToB = listWin.toB;

      // No comparison window for a single bucket: "vs the hour before" is a
      // different question from the one the range picker is answering.
      const hasPrev = !at;
      const prevWin = hasPrev ? previousWin : null;

      const figures = windowFigures(reader, current, prevWin);
      const since = store.analytics.confirmationSince();
      const prevSummary = figures.previous;

      const previous: AnalyticsTotals = {
        pageviews: prevSummary?.pageviews ?? 0,
        sections: prevSummary?.tabs ?? 0,
        clicks: prevSummary?.clicks ?? 0,
        visitLength: prevSummary?.completed ?? 0,
        bots: prevSummary?.bots ?? 0,
        probes: prevSummary?.probes ?? 0,
      };
      const hasPrevious = Object.values(previous).some((v) => v > 0);

      const top = (d: AnalyticsDimension) => reader.top(d, listWin);
      const series = (d: AnalyticsDimension) => reader.series(d, current);

      const referrerRules = store.content.getReferrerRules();

      /**
       * A referrer *label* ("Reddit") isn't a stored key: `groupReferrers`
       * folds several raw hosts (and `utm:`-tagged sources) into one label on
       * read. So filtering by label can't be an equality match against
       * `analytics_hourly.key`; it has to expand back to the label's member
       * keys over the window being queried first. Every other dimension's
       * display key already *is* its stored key.
       */
      function filterKeys(dimension: AnalyticsDimension, key: string, from: string, to: string): string[] {
        if (dimension === "referrer") {
          return store.analytics
            .topHourly("referrer", from, to, 1000)
            .filter((r) => classifyReferrer(r.key, referrerRules) === key)
            .map((r) => r.key);
        }
        // A path filter can name a group (`/docs`) or one concrete path.
        if (dimension === "path") {
          return store.analytics
            .topHourly("path", from, to, 5000)
            .filter((r) => pathMatchesFilter(r.key, key))
            .map((r) => r.key);
        }
        return [key];
      }

      /*
       * Dimension-filtered views read `analytics_hourly` (and its pair rows)
       * directly, so they are bounded by hourly retention; the rollups carry no
       * pair dimensions.
       */
      let filtered: NonNullable<AnalyticsResponse["filtered"]> | null = null;
      const narrowedLists: Partial<Record<AnalyticsCardId, AnalyticsRow[]>> = {};
      if (dim && filterKey) {
        // The chart series covers the full range; the total (like every other
        // list total) honours `at`. The member-key set can differ between the
        // two windows (a source relabeled mid-range, say) so each is
        // resolved separately rather than reused.
        const rangeKeys = filterKeys(dim, filterKey, fromB, toB);
        const rawSeries = store.analytics.seriesHourly(dim, fromB, toB, "hour", rangeKeys);
        const filteredSeries = unit === "day" ? toLocalDays(rawSeries, timeZone, current.from, current.to) : rawSeries;

        const listKeys = filterKeys(dim, filterKey, listFromB, listToB);
        const total = store.analytics
          .topHourly(dim, listFromB, listToB, 1000, listKeys)
          .reduce((s, r) => s + r.count, 0);

        const previousTotal = hasPrev
          ? store.analytics
              .topHourly(
                dim,
                previousWin.fromB,
                previousWin.toB,
                1000,
                filterKeys(dim, filterKey, previousWin.fromB, previousWin.toB),
              )
              .reduce((s, r) => s + r.count, 0)
          : null;

        filtered = {
          dimension: dim,
          key: filterKey,
          series: filteredSeries,
          total,
          previous: previousTotal,
          narrowed: [],
          notFilterable: [],
        };

        if (isPairedDimension(dim)) {
          for (const [card, target] of Object.entries(CROSS_CARDS)) {
            if (target === dim) continue;
            narrowedLists[card as keyof typeof CROSS_CARDS] = store.analytics.topCross(
              dim,
              listKeys,
              target,
              listFromB,
              listToB,
            );
            filtered.narrowed.push(card as AnalyticsCardId);
          }
          // Bot and probe requests never count as page views, so none of them
          // shares a path, browser, OS, device or referrer with one.
          narrowedLists.bots = [];
          narrowedLists.probes = [];
          filtered.narrowed.push("bots", "probes");
          filtered.notFilterable.push({ card: "engagement", source: "script" });
        } else if (dim === "bot" || dim === "probe") {
          for (const card of Object.keys(CROSS_CARDS)) {
            narrowedLists[card as keyof typeof CROSS_CARDS] = [];
            filtered.narrowed.push(card as AnalyticsCardId);
          }
          const other = dim === "bot" ? "probes" : "bots";
          narrowedLists[other] = [];
          filtered.narrowed.push(other);
          filtered.notFilterable.push({ card: "engagement", source: "script" });
        } else {
          for (const card of [...Object.keys(CROSS_CARDS), "bots", "probes"]) {
            filtered.notFilterable.push({ card: card as AnalyticsCardId, source: "log" });
          }
          filtered.notFilterable.push({ card: "engagement", source: "script" });
        }
      }

      // Log-derived lists, narrowed by the dimension filter when one is active.
      // Paths and referrers are grouped on read, not on ingest: the rules can
      // change, and a rule added today has to relabel everything that ever
      // arrived. Baking labels into the aggregates would only label the future.
      const listOf = (card: AnalyticsCardId, dimension: AnalyticsDimension): AnalyticsRow[] =>
        narrowedLists[card] ?? reader.top(dimension, listWin, 1000);
      const topRows = (card: AnalyticsCardId, dimension: AnalyticsDimension) => listOf(card, dimension).slice(0, 20);
      const pathRows = groupPaths(listOf("paths", "path"))
        .slice(0, 20)
        .map((g) => (g.children ? { ...g, children: g.children.slice(0, MAX_PATH_CHILDREN) } : g));

      const total = figures.current;
      const measured = since !== null && since <= toB;

      const response: AnalyticsResponseFull = {
        range: {
          from: current.from,
          to: current.to,
          hours,
          unit,
          timeZone,
          ...(at ? { at } : {}),
          previous: hasPrev ? { from: previousWin.from, to: previousWin.to } : null,
          ...(reader.approximateZone ? { approximateZone: true } : {}),
        },
        paths: pathRows,
        referrers: groupReferrers(listOf("referrers", "referrer"), referrerRules).slice(0, 20),
        browsers: topRows("browsers", "browser"),
        os: topRows("os", "os"),
        devices: topRows("devices", "device"),
        bots: topRows("bots", "bot"),
        probes: topRows("probes", "probe"),
        visits: {
          total: total.confirmed,
          previous: prevSummary ? prevSummary.confirmed : null,
          source: "script",
          measured,
        },
        completedVisits: {
          total: total.completed,
          previous: prevSummary ? prevSummary.completed : null,
          source: "script",
        },
        pageviews: { total: total.pageviews, previous: prevSummary ? prevSummary.pageviews : null, source: "log" },
        secondPage: {
          ...secondPageFigure(reader.top("session_tabs", current, SESSION_TAB_BUCKETS.length)),
          source: "script",
        },
        metricSources: METRIC_SOURCES,
        // The graph: stacked composition over time, per metric.
        chart: {
          unit,
          pageviews: groupPathSeries(series("path")),
          sections: series("tab"),
          clicks: series("click"),
          visitLength: series("session_dwell"),
          bots: series("bot"),
          probes: series("probe"),
        },
        // Omitted rather than zeroed when the previous window predates any data,
        // so the UI can say "no comparison" instead of "down 100%".
        ...(hasPrevious ? { previous } : {}),
        referrerRules,
        // Engagement top lists, over the list window.
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
        headline: headlineBlock(figures, since, current, prevWin),
        quality: qualityBlock(store, reader, figures, since, current),
        sections: sectionsBlock(store, reader, current, total.loads),
        sources: sourcesBlock(reader, current),
        // Absent (not an empty object) when no access log is configured at
        // all: that's the existing, separate "never configured" case the
        // traffic banner already explains.
        ...(env.accessLog ? { ingest: store.analytics.getIngestStatus(env.accessLog) } : {}),
        ...(filtered ? { filtered } : {}),
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
      const fromB = range.hours === null ? null : isoHour(new Date(now.getTime() - (range.hours - 1) * HOUR));
      const removed =
        fromB === null
          ? store.analytics.clearHourly(BUCKET_MIN, BUCKET_MAX) + store.analytics.clearDaily(BUCKET_MIN, BUCKET_MAX)
          : store.analytics.clearHourly(fromB, toB);

      // The rollups are copies of what was just deleted. Drop them, then re-derive
      // the buckets that still have hourly rows (a day only partly cleared).
      if (fromB === null) {
        store.analytics.clearAllRollups();
      } else {
        store.analytics.clearRollups(fromB, toB);
        rollupRange(store, "hour", fromB, toB, { now });
        rollupRange(store, "day", bucketDay(fromB, ROLLUP_TIME_ZONE), bucketDay(toB, ROLLUP_TIME_ZONE), { now });
      }

      /**
       * Make the deletion durable.
       *
       * The rows are gone, but the access log on the proxy still holds every line
       * that produced them, and this server has no business editing it. The byte
       * offset usually stops a re-read — until the log rotates, the file shrinks,
       * the offset resets and the whole thing is read again. One rotation and the
       * deletion is undone.
       *
       * The watermark only ever moves forward. Clearing a *narrower* range after a
       * wider one must not re-open the older window: the rows there are already
       * gone, and re-ingesting them would look like traffic appearing out of a
       * range the operator deleted.
       */
      const previous = store.analytics.getClearedThrough();
      if (!previous || toB > previous) store.analytics.setClearedThrough(toB);

      const cleared: ClearAnalyticsResponse = { ok: true, removed };
      return cleared;
    },
  );
}
