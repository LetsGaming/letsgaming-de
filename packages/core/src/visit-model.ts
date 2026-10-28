/**
 * The visit model: how the dashboard turns anonymous counters into traffic
 * numbers. One place, shared by the server (rollups, deltas, response blocks) and
 * the web app (display), so a definition can't drift between the two.
 *
 * Nothing here knows about a visitor. Every number is an aggregate reconciliation
 * of counters that are each emitted exactly once per request or per page load:
 *
 *   pageviews  = sum(path)         access log, browser-like requests
 *   bots       = sum(bot)          access log, self-identified automation
 *   probes     = sum(probe)        access log, scanner paths
 *   loads      = sum(viewport)     the tracker ran (one `viewport` per load)
 *   confirmed  = sum(visit)        a load that showed real engagement
 *   completed  = sum(session_dwell) a confirmed-or-not visit whose tab was closed
 *                                   while the page could still report
 */

import { DWELL_BUCKETS, SESSION_TAB_BUCKETS, type DwellBucket } from "./engagement.js";

/** `n / d`, or null when there is nothing to divide by (never a fake 0). */
export function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

/** Share of page views whose page also ran the tracker. Null with no page views. */
export function beaconCoverage(loads: number, pageviews: number): number | null {
  return ratio(loads, pageviews);
}

/** Share of tracker loads that showed engagement. Null with no loads. */
export function confirmationRate(confirmed: number, loads: number): number | null {
  return ratio(confirmed, loads);
}

/** Page views no script ever reported on: non-JS clients, blockers, DNT, opt-out. */
export function unverifiedViews(pageviews: number, loads: number): number {
  return Math.max(0, pageviews - loads);
}

/** Relative change, in percent. Null when there is nothing to compare against. */
export function deltaPct(total: number | null, previous: number | null): number | null {
  if (total === null || previous === null || previous === 0) return null;
  return ((total - previous) / previous) * 100;
}

// ── dwell medians ────────────────────────────────────────────────────────────

/**
 * Representative seconds per dwell bucket. The counters only say how many visits
 * fell in each bucket, so a median is the midpoint of the bucket holding the 50th
 * percentile. The open-ended "10m+" bucket is assumed to be 15 minutes.
 */
export const DWELL_MIDPOINT_SECONDS: Record<DwellBucket, number> = {
  "<5s": 2.5,
  "5-15s": 10,
  "15-30s": 22.5,
  "30-60s": 45,
  "1-3m": 120,
  "3-10m": 390,
  "10m+": 900,
};

export function medianDwell(counts: Partial<Record<DwellBucket, number>>): {
  seconds: number;
  bucket: DwellBucket;
} | null {
  const total = DWELL_BUCKETS.reduce((n, b) => n + (counts[b] ?? 0), 0);
  if (total === 0) return null;
  let seen = 0;
  for (const bucket of DWELL_BUCKETS) {
    seen += counts[bucket] ?? 0;
    if (seen >= total / 2) return { seconds: DWELL_MIDPOINT_SECONDS[bucket], bucket };
  }
  return null;
}

// ── summary metrics ──────────────────────────────────────────────────────────

/** The dimensions a summary is computed from. Rollups of the rest feed lists only. */
export const SUMMARY_DIMENSIONS = [
  "path",
  "bot",
  "probe",
  "viewport",
  "visit",
  "session_dwell",
  "click",
  "tab",
  "module",
  "session_modules",
] as const;

const SESSION_MODULE_METRICS = ["sm_1", "sm_2", "sm_3", "sm_4"] as const;
const SESSION_DWELL_METRICS = ["sd_0", "sd_1", "sd_2", "sd_3", "sd_4", "sd_5", "sd_6"] as const;

/**
 * Every additive per-bucket figure the store keeps in `analytics_summary`.
 * Additive on purpose: a window's value is the sum of its buckets, and ratios and
 * medians are derived from those sums afterwards (`headlineValue`).
 */
export const SUMMARY_METRICS = [
  "pageviews",
  "bots",
  "probes",
  "loads",
  "confirmed",
  "completed",
  "clicks",
  "tabs",
  "modules_seen",
  ...SESSION_MODULE_METRICS,
  ...SESSION_DWELL_METRICS,
] as const;
export type SummaryMetric = (typeof SUMMARY_METRICS)[number];
export type SummaryValues = Record<SummaryMetric, number>;

export function emptySummary(): SummaryValues {
  return Object.fromEntries(SUMMARY_METRICS.map((m) => [m, 0])) as SummaryValues;
}

export function addSummary(a: SummaryValues, b: Partial<SummaryValues>): SummaryValues {
  const out = { ...a };
  for (const m of SUMMARY_METRICS) out[m] += b[m] ?? 0;
  return out;
}

const SIMPLE_METRIC: Partial<Record<string, SummaryMetric>> = {
  path: "pageviews",
  bot: "bots",
  probe: "probes",
  viewport: "loads",
  visit: "confirmed",
  session_dwell: "completed",
  click: "clicks",
  tab: "tabs",
  module: "modules_seen",
};

/** Fold counter rows (any buckets, any dimensions) into one summary. */
export function summarize(rows: Iterable<{ dimension: string; key: string; count: number }>): SummaryValues {
  const out = emptySummary();
  for (const { dimension, key, count } of rows) {
    const simple = SIMPLE_METRIC[dimension];
    if (simple) out[simple] += count;
    if (dimension === "session_modules") {
      const i = (SESSION_TAB_BUCKETS as readonly string[]).indexOf(key);
      if (i >= 0) out[SESSION_MODULE_METRICS[i]!] += count;
    } else if (dimension === "session_dwell") {
      const i = (DWELL_BUCKETS as readonly string[]).indexOf(key);
      if (i >= 0) out[SESSION_DWELL_METRICS[i]!] += count;
    }
  }
  return out;
}

/** Modules per visit, from the `session_modules` buckets ("4+" counted as 4: a floor). */
export function sectionsPerVisit(s: SummaryValues): number | null {
  const visits = SESSION_MODULE_METRICS.reduce((n, m) => n + s[m], 0);
  const modules = SESSION_MODULE_METRICS.reduce((n, m, i) => n + s[m] * (i + 1), 0);
  return ratio(modules, visits);
}

/** Median visit length in seconds, from the `session_dwell` buckets. */
export function medianVisitSeconds(s: SummaryValues): number | null {
  const counts: Partial<Record<DwellBucket, number>> = {};
  DWELL_BUCKETS.forEach((b, i) => {
    counts[b] = s[SESSION_DWELL_METRICS[i]!];
  });
  return medianDwell(counts)?.seconds ?? null;
}

// ── headline metrics ─────────────────────────────────────────────────────────

export const HEADLINE_METRICS = [
  "pageviews",
  "confirmedVisits",
  "loads",
  "beaconCoverage",
  "sectionsPerVisit",
  "medianVisitSeconds",
  "clicks",
  "bots",
  "probes",
] as const;
export type HeadlineMetricId = (typeof HEADLINE_METRICS)[number];

/** Headline metrics that need the `visit` event, and so can be "not measured". */
export const CONFIRMATION_METRICS: readonly HeadlineMetricId[] = ["confirmedVisits"];

export function headlineValue(id: HeadlineMetricId, s: SummaryValues): number | null {
  switch (id) {
    case "pageviews":
      return s.pageviews;
    case "confirmedVisits":
      return s.confirmed;
    case "loads":
      return s.loads;
    case "beaconCoverage":
      return beaconCoverage(s.loads, s.pageviews);
    case "sectionsPerVisit":
      return sectionsPerVisit(s);
    case "medianVisitSeconds":
      return medianVisitSeconds(s);
    case "clicks":
      return s.clicks;
    case "bots":
      return s.bots;
    case "probes":
      return s.probes;
  }
}

/** One headline number with its comparison and trend. */
export interface HeadlineMetric {
  /** Null when the figure is undefined for the window (a ratio with no denominator). */
  total: number | null;
  /** The same figure over the equal-length window immediately before. Null when
   *  there is no comparison window (a single selected bucket). */
  previous: number | null;
  /** `(total - previous) / previous * 100`; null when either side is missing or
   *  `previous` is 0, or the previous window was not measured. */
  deltaPct: number | null;
  /** One value per bucket of the range axis, oldest first. Undefined ratios are 0. */
  series: number[];
  /** False when the window ends before the metric existed: show "not measured". */
  measured: boolean;
  /** Same for the previous window; a delta against an unmeasured window is null. */
  previousMeasured: boolean;
}

export type AnalyticsHeadline = Record<HeadlineMetricId, HeadlineMetric>;

export interface HeadlineInput {
  current: SummaryValues;
  /** Null when there is no comparison window. */
  previous: SummaryValues | null;
  /** One summary per bucket of the range axis, oldest first. */
  series: readonly SummaryValues[];
  /** Whether the current and previous windows contain any confirmation data. */
  measured: boolean;
  previousMeasured: boolean;
}

export function buildHeadline(input: HeadlineInput): AnalyticsHeadline {
  const out = {} as AnalyticsHeadline;
  for (const id of HEADLINE_METRICS) {
    const needsVisit = CONFIRMATION_METRICS.includes(id);
    const measured = !needsVisit || input.measured;
    const previousMeasured = input.previous !== null && (!needsVisit || input.previousMeasured);
    const total = headlineValue(id, input.current);
    const previous = input.previous === null ? null : headlineValue(id, input.previous);
    out[id] = {
      total,
      previous,
      deltaPct: previousMeasured && measured ? deltaPct(total, previous) : null,
      series: input.series.map((s) => headlineValue(id, s) ?? 0),
      measured,
      previousMeasured,
    };
  }
  return out;
}

// ── confirmation cutover ─────────────────────────────────────────────────────

/**
 * Whether any part of `[from, to]` is on or after the first confirmed visit.
 * All three are bucket strings in the same format. Before `since` nothing could
 * have been confirmed, so a 0 there is "not measured", not "no visits".
 */
export function isMeasured(since: string | null, to: string): boolean {
  return since !== null && since <= to;
}

/** Whether the window starts before `since` (its early part is not measured). */
export function isPartiallyMeasured(since: string | null, from: string): boolean {
  return since !== null && since > from;
}

// ── traffic quality ──────────────────────────────────────────────────────────

/** The reconciliation funnel for one window. */
export interface QualityFunnel {
  /** Every request counted: page views + bots + probes. */
  requests: number;
  probes: number;
  bots: number;
  /** Page views no script reported on (`pageviews - loads`, never negative). */
  unverified: number;
  /** Page views that ran the tracker. */
  loads: number;
  /** Loads that showed real engagement. 0 and unmeasured before `confirmationSince`. */
  confirmed: number;
  /** Visits whose tab reported its end. */
  completed: number;
}

export function buildFunnel(s: SummaryValues): QualityFunnel {
  return {
    requests: s.pageviews + s.bots + s.probes,
    probes: s.probes,
    bots: s.bots,
    unverified: unverifiedViews(s.pageviews, s.loads),
    loads: s.loads,
    confirmed: s.confirmed,
    completed: s.completed,
  };
}

/** The summary figures a dimension feeds, for deleting them when the dimension is cleared. */
export function summaryMetricsOf(dimension: string): SummaryMetric[] {
  const simple = SIMPLE_METRIC[dimension];
  const out: SummaryMetric[] = simple ? [simple] : [];
  if (dimension === "session_modules") out.push(...SESSION_MODULE_METRICS);
  if (dimension === "session_dwell") out.push(...SESSION_DWELL_METRICS);
  return out;
}
