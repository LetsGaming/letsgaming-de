import {
  DWELL_BUCKETS,
  SCROLL_DEPTHS,
  axisBuckets,
  type AnalyticsAreaScroll,
  type AnalyticsPoint,
  type AnalyticsQuality,
  type AnalyticsRow,
  type AnalyticsSectionFlow,
  type AnalyticsSectionModule,
  type AnalyticsSections,
  type DwellBucket,
  type HeadlineMetric,
  type HeadlineMetricId,
  type QualityFunnel,
} from "@lg/core";
import type { DwellHistogram, ScrollFunnel } from "./engagement-keys";

/** Pure view logic for the analytics dashboard: what to say, never how it looks. */

// ── headline tiles ───────────────────────────────────────────────────────────

export type DeltaDirection = "up" | "down" | "flat" | "";

export interface DeltaView {
  /** "+18%", "−4%", "0%"; empty when there is nothing honest to say. */
  text: string;
  direction: DeltaDirection;
}

/**
 * The server's delta, as text. `null` (no baseline, an unmeasured side, or a zero
 * baseline) renders nothing: never a fake 0%.
 */
export function deltaView(deltaPct: number | null | undefined): DeltaView {
  if (deltaPct === null || deltaPct === undefined || !Number.isFinite(deltaPct)) {
    return { text: "", direction: "" };
  }
  const rounded = Math.round(Math.abs(deltaPct));
  if (rounded === 0) return { text: "0%", direction: "flat" };
  return deltaPct > 0 ? { text: `+${rounded}%`, direction: "up" } : { text: `−${rounded}%`, direction: "down" };
}

export const HEADLINE_TILE_IDS = [
  "pageviews",
  "confirmedVisits",
  "beaconCoverage",
  "sectionsPerVisit",
  "medianVisitSeconds",
] as const satisfies readonly HeadlineMetricId[];
export type HeadlineTileId = (typeof HEADLINE_TILE_IDS)[number];

export interface HeadlineTileSpec {
  label: string;
  /** One line on what the number counts and where it comes from. */
  explainer: string;
}

export const HEADLINE_TILES: Record<HeadlineTileId, HeadlineTileSpec> = {
  pageviews: {
    label: "Page views",
    explainer: "Requests from browser-like clients in the access log. Bots and scanners are excluded; JS-less clients are not.",
  },
  confirmedVisits: {
    label: "Confirmed visits",
    explainer:
      "A page load whose script reported real engagement: a scroll to 25 percent, a section seen, 5 seconds visible, or a click. A bare load is not a visit.",
  },
  beaconCoverage: {
    label: "Beacon coverage",
    explainer:
      "Script loads divided by page views. The rest are visits no script reported on: clients without JavaScript, blockers, Do Not Track and opt-outs.",
  },
  sectionsPerVisit: {
    label: "Sections per visit",
    explainer: "Average number of page sections seen per completed visit.",
  },
  medianVisitSeconds: {
    label: "Median visit length",
    explainer: "Middle visit length, estimated from time buckets, over completed visits.",
  },
};

export type TileValueState = "value" | "unmeasured" | "empty";

export interface TileValue {
  state: TileValueState;
  /** The number as text; empty unless `state` is "value". */
  text: string;
}

export function formatSeconds(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${m}m` : `${m}m ${rest}s`;
}

export function formatPercent(ratio: number): string {
  const p = ratio * 100;
  return `${p > 0 && p < 1 ? "<1" : Math.round(p)}%`;
}

export function formatTileValue(id: HeadlineTileId, m: HeadlineMetric): TileValue {
  if (!m.measured) return { state: "unmeasured", text: "" };
  if (m.total === null) return { state: "empty", text: "" };
  switch (id) {
    case "beaconCoverage":
      return { state: "value", text: formatPercent(m.total) };
    case "sectionsPerVisit":
      return { state: "value", text: m.total.toFixed(1) };
    case "medianVisitSeconds":
      return { state: "value", text: formatSeconds(m.total) };
    default:
      return { state: "value", text: m.total.toLocaleString("en-US") };
  }
}

/** The "vs previous 72h" caption, or why there is no comparison. */
export function comparisonCaption(m: HeadlineMetric, windowLabel: string): string {
  if (!m.measured) return "";
  if (m.previous === null) return "no earlier window to compare";
  if (!m.previousMeasured) return "previous window not measured";
  if (m.deltaPct === null) return `no baseline in previous ${windowLabel}`;
  return `vs previous ${windowLabel}`;
}

/** A series is only worth drawing as a trend when it has more than one point. */
export function sparkValues(m: HeadlineMetric): number[] {
  return m.measured ? m.series : [];
}

export function sparkLabel(label: string, m: HeadlineMetric, unit: "hour" | "day"): string {
  if (!m.measured) return `${label} trend: not measured yet`;
  return `${label} trend, one value per ${unit}: ${m.series.join(", ") || "no data"}`;
}

// ── chart series ─────────────────────────────────────────────────────────────

/** A headline series as chart rows, aligned to the same axis the server used. */
export function seriesRows(
  series: readonly number[],
  range: { from: string; to: string },
  unit: "hour" | "day",
  key: string,
): AnalyticsPoint[] {
  const buckets = axisBuckets(range.from, range.to, unit);
  const rows: AnalyticsPoint[] = [];
  series.forEach((count, i) => {
    const bucket = buckets[i];
    if (bucket !== undefined && count > 0) rows.push({ bucket, key, count });
  });
  return rows;
}

// ── traffic quality ──────────────────────────────────────────────────────────

export interface FunnelStage {
  id: "requests" | "probes" | "bots" | "pageviews" | "loads" | "confirmed" | "completed";
  label: string;
  count: number;
  /** Bar width as a fraction of requests, 0 to 1. */
  width: number;
  /** Nested under "requests" in the layout: the three things a request can be. */
  split: boolean;
  /** True when the number is not a real zero (confirmation before it existed). */
  unmeasured: boolean;
}

const fraction = (n: number, d: number): number => (d > 0 ? Math.min(1, Math.max(0, n / d)) : 0);

export function funnelStages(f: QualityFunnel, measured: boolean): FunnelStage[] {
  const pageviews = Math.max(0, f.requests - f.probes - f.bots);
  const stage = (
    id: FunnelStage["id"],
    label: string,
    count: number,
    split = false,
    unmeasured = false,
  ): FunnelStage => ({ id, label, count, width: unmeasured ? 0 : fraction(count, f.requests), split, unmeasured });
  return [
    stage("requests", "Requests", f.requests),
    stage("probes", "Scanner probes", f.probes, true),
    stage("bots", "Bots", f.bots, true),
    stage("pageviews", "Page views", pageviews, true),
    stage("loads", "Script loads", f.loads),
    stage("confirmed", "Confirmed visits", f.confirmed, false, !measured),
    stage("completed", "Completed visits", f.completed),
  ];
}

export interface QualityNotes {
  /** Show "Confirmation not measured in this range" instead of the rates. */
  unmeasured: boolean;
  partial: boolean;
  approximateHistory: boolean;
}

export function qualityNotes(q: AnalyticsQuality): QualityNotes {
  return {
    unmeasured: !q.measured,
    partial: q.measured && q.partiallyMeasured,
    approximateHistory: q.approximateHistory,
  };
}

export const EXCLUSION_LABELS: Record<string, string> = {
  "probe-admin-panel": "Admin panel scan (phpMyAdmin and similar)",
  "probe-wordpress": "WordPress scan",
  "probe-secrets-dotfile": "Hidden file scan (.env, .git)",
  "probe-secrets-file": "Credential file scan",
  "probe-backup-file": "Backup file scan",
  "probe-backup-dir": "Backup folder scan",
  "probe-shell-endpoint": "Shell and console endpoint scan",
  "probe-webshell": "Web shell scan",
  "probe-traversal": "Path traversal attempt",
  "probe-server-script": "Server script scan (.php, .asp)",
  "probe-scanner-furniture": "Known scanner paths",
  "probe-query-wordpress": "WordPress query probe",
  "probe-query-php": "PHP query probe",
  "probe-query-lfi": "File inclusion query probe",
  "probe-query-cloaker": "Cloaker query probe",
  "ua-search-engine": "Search engine crawler",
  "ua-ai-crawler": "AI crawler",
  "ua-link-preview": "Link preview fetcher",
  "ua-monitor": "Uptime or monitoring check",
  "ua-headless": "Headless browser or test tool",
  "ua-http-library": "HTTP library or command line client",
  "ua-generic-bot": "Self-described bot",
  "ua-tool-token": "Scanner or tool user agent",
  "ua-empty": "Empty user agent",
  "ua-no-platform": "User agent without a platform",
  "ua-no-engine": "User agent without a browser engine",
  "ua-malformed-webkit": "Malformed WebKit user agent",
  "ua-malformed-chrome-version": "Malformed Chrome version",
  "ua-stale-browser": "Outdated browser version",
  "ua-embedded-url": "URL inside the user agent",
  "ua-unknown-suffix": "Unknown user agent suffix",
  "http-head": "HEAD request",
  "http-post-page": "Write request to a page",
  "referer-self-http": "Insecure self-referrer",
  "referer-spam": "Referrer spam",
  "burst-adjacent": "Request burst next to a flagged hit",
  "not-found": "Not found (404 or 410)",
  "ignored-method": "Unused request method",
  "ignored-status": "Redirect or informational response",
  "ignored-internal-path": "Internal path",
  "ignored-asset": "Static asset",
  "ignored-preview": "CMS preview frame",
  "ignored-not-served": "Not served",
  pageview: "Page view",
};

export function exclusionLabel(id: string): string {
  return EXCLUSION_LABELS[id] ?? id;
}

export interface ExclusionView {
  id: string;
  label: string;
  count: number;
  /** Fraction of the largest row, for the bar. */
  width: number;
}

export function exclusionRows(rows: readonly AnalyticsRow[]): ExclusionView[] {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return rows.map((r) => ({ id: r.key, label: exclusionLabel(r.key), count: r.count, width: fraction(r.count, max) }));
}

// ── sources ──────────────────────────────────────────────────────────────────

export const SOURCE_LABELS: Record<string, string> = {
  search: "Search",
  social: "Social",
  campaign: "Campaign",
  referral: "Referral",
  direct: "Direct",
};

export function sourceLabel(key: string): string {
  return SOURCE_LABELS[key] ?? key;
}

// ── section flow ─────────────────────────────────────────────────────────────

/** "github-activity" or "githubActivity" as "Github activity". */
export function prettifyId(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : id;
}

export interface ModuleRow {
  id: string;
  label: string;
  area: string | null;
  areaLabel: string;
  seen: number;
  /** Funnel bar width, 0 to 1 (`seenRate` of script loads). */
  width: number;
  /** "42%" or "n/a" when there were no loads. */
  rateText: string;
  entries: number;
  exits: number;
  /** Bar widths for the entries and exits columns, relative to the largest. */
  entryWidth: number;
  exitWidth: number;
  dwell: DwellHistogram;
  medianDwellText: string;
}

export function dwellFromRecord(section: string, dwell: Partial<Record<DwellBucket, number>>): DwellHistogram {
  const total = DWELL_BUCKETS.reduce((n, b) => n + (dwell[b] ?? 0), 0);
  return {
    section,
    total,
    buckets: DWELL_BUCKETS.map((bucket) => {
      const count = dwell[bucket] ?? 0;
      return { bucket, count, share: fraction(count, total) };
    }),
  };
}

/** Modules in the server's page order (nav order, then module order), never re-sorted. */
export function moduleRows(modules: readonly AnalyticsSectionModule[]): ModuleRow[] {
  const maxEntries = modules.reduce((m, x) => Math.max(m, x.entries), 0);
  const maxExits = modules.reduce((m, x) => Math.max(m, x.exits, 0), 0);
  return modules.map((m) => ({
    id: m.id,
    label: prettifyId(m.id),
    area: m.area,
    areaLabel: m.area ? prettifyId(m.area) : "Not placed",
    seen: m.seen,
    width: m.seenRate === null ? 0 : fraction(m.seenRate, 1),
    rateText: m.seenRate === null ? "n/a" : formatPercent(m.seenRate),
    entries: m.entries,
    exits: m.exits,
    entryWidth: fraction(m.entries, maxEntries),
    exitWidth: fraction(m.exits, maxExits),
    dwell: dwellFromRecord(m.id, m.dwell),
    medianDwellText: m.medianDwellSeconds === null ? "" : formatSeconds(m.medianDwellSeconds),
  }));
}

export interface FlowRow {
  label: string;
  count: number;
  width: number;
}

export function flowRows(flow: readonly AnalyticsSectionFlow[], limit = 8): FlowRow[] {
  const top = flow.slice(0, limit);
  const max = top.reduce((m, f) => Math.max(m, f.count), 0);
  return top.map((f) => ({
    label: `${prettifyId(f.from)} -> ${prettifyId(f.to)}`,
    count: f.count,
    width: fraction(f.count, max),
  }));
}

export interface BucketBar {
  bucket: string;
  count: number;
  share: number;
}

export function bucketBars(rows: readonly { bucket: string; count: number }[]): BucketBar[] {
  const total = rows.reduce((n, r) => n + r.count, 0);
  return rows.map((r) => ({ bucket: r.bucket, count: r.count, share: fraction(r.count, total) }));
}

/** Per-area scroll depth in the shape the existing bar funnel renders. */
export function areaScrollFunnels(areas: readonly AnalyticsAreaScroll[]): ScrollFunnel[] {
  return areas
    .map((a) => ({
      section: a.area,
      entered: a.views,
      steps: SCROLL_DEPTHS.map((depth) => ({
        depth,
        count: a.depths[depth] ?? 0,
        share: fraction(a.depths[depth] ?? 0, a.views),
      })),
    }))
    .sort((a, b) => b.entered - a.entered || a.section.localeCompare(b.section));
}

/** No module has been seen yet: collection has not run, or nothing was loaded. */
export function sectionsEmpty(s: AnalyticsSections): boolean {
  return s.loads === 0 || s.modules.every((m) => m.seen === 0);
}
