/**
 * The visit-model blocks of the analytics response: headline metrics with their
 * deltas, the traffic-quality funnel, module-level engagement and referrer
 * categories. Pure shaping over a `Reader`; the definitions live in `@lg/core`'s
 * visit-model.
 */

import {
  DWELL_BUCKETS,
  SCROLL_DEPTHS,
  SESSION_TAB_BUCKETS,
  addSummary,
  axisBuckets,
  beaconCoverage,
  buildFunnel,
  buildHeadline,
  confirmationRate,
  emptySummary,
  isMeasured,
  isPartiallyMeasured,
  medianDwell,
  ratio,
  walkNav,
  isLeaf,
  type AnalyticsQuality,
  type AnalyticsSectionModule,
  type AnalyticsSections,
  type AnalyticsSources,
  type DwellBucket,
  type AnalyticsHeadline,
  type ModuleDescriptor,
  type NavNode,
  type ScrollDepth,
  type SummaryValues,
} from "@lg/core";
import type { Store } from "@lg/db";
import type { Reader } from "./reader.js";
import type { Win } from "./window.js";

/** Rows fetched for a list that is joined back to a known set of ids. */
const WIDE = 5000;
const MAX_FLOW = 20;
const MAX_EXCLUSIONS = 20;

const sum = (summaries: Iterable<SummaryValues>): SummaryValues => {
  let total = emptySummary();
  for (const s of summaries) total = addSummary(total, s);
  return total;
};

export interface WindowFigures {
  current: SummaryValues;
  /** Null when there is no comparison window. */
  previous: SummaryValues | null;
  /** One summary per bucket of the current axis, oldest first, zero-filled. */
  series: SummaryValues[];
}

export function windowFigures(reader: Reader, current: Win, previous: Win | null): WindowFigures {
  const byBucket = reader.summaries(current);
  const axis = axisBuckets(current.from, current.to, current.unit);
  return {
    current: sum(byBucket.values()),
    previous: previous ? sum(reader.summaries(previous).values()) : null,
    series: axis.map((b) => byBucket.get(b) ?? emptySummary()),
  };
}

export function headlineBlock(
  figures: WindowFigures,
  since: string | null,
  current: Win,
  previous: Win | null,
): AnalyticsHeadline {
  return buildHeadline({
    current: figures.current,
    previous: figures.previous,
    series: figures.series,
    measured: isMeasured(since, current.toB),
    previousMeasured: previous !== null && isMeasured(since, previous.toB),
  });
}

export function qualityBlock(
  store: Store,
  reader: Reader,
  figures: WindowFigures,
  since: string | null,
  current: Win,
): AnalyticsQuality {
  const s = figures.current;
  const oldestHourly = store.analytics.oldestHourlyDay();
  const approx = store.analytics.getRollupState("day")?.approx === true;
  return {
    funnel: buildFunnel(s),
    coverage: beaconCoverage(s.loads, s.pageviews),
    confirmationRate: confirmationRate(s.confirmed, s.loads),
    confirmationSince: since,
    measured: isMeasured(since, current.toB),
    partiallyMeasured: isPartiallyMeasured(since, current.fromB),
    exclusions: reader.top("exclusion", current, MAX_EXCLUSIONS),
    approximateHistory:
      reader.grain === "day" && approx && oldestHourly !== null && current.from < oldestHourly,
  };
}

export function sourcesBlock(reader: Reader, current: Win): AnalyticsSources {
  const rows = reader.top("source", current, 10);
  const total = rows.reduce((n, r) => n + r.count, 0);
  return { total, rows: rows.map((r) => ({ key: r.key, count: r.count, share: ratio(r.count, total) })) };
}

/** Module ids in page order: nav order, each leaf's modules in order, the unplaced last. */
export function modulesInPageOrder(
  nav: NavNode[],
  modules: readonly ModuleDescriptor[],
): { id: string; area: string | null }[] {
  const known = new Set(modules.map((m) => m.id));
  const placed = new Map<string, string>();
  walkNav(nav, (node) => {
    if (node.hidden || !isLeaf(node)) return;
    for (const id of node.modules ?? []) if (known.has(id) && !placed.has(id)) placed.set(id, node.id);
  });
  const out = [...placed].map(([id, area]) => ({ id, area: area as string | null }));
  for (const m of modules) if (!placed.has(m.id)) out.push({ id: m.id, area: null });
  return out;
}

const emptyDwell = (): Record<DwellBucket, number> =>
  Object.fromEntries(DWELL_BUCKETS.map((b) => [b, 0])) as Record<DwellBucket, number>;

export function sectionsBlock(store: Store, reader: Reader, current: Win, loads: number): AnalyticsSections {
  const countsOf = (dimension: "module" | "module_entry" | "module_exit"): Map<string, number> =>
    new Map(reader.top(dimension, current, WIDE).map((r) => [r.key, r.count]));
  const seen = countsOf("module");
  const entries = countsOf("module_entry");
  const exits = countsOf("module_exit");

  const dwell = new Map<string, Record<DwellBucket, number>>();
  for (const row of reader.top("module_dwell", current, WIDE)) {
    const [id, bucket] = row.key.split("|");
    if (!id || !bucket || !(DWELL_BUCKETS as readonly string[]).includes(bucket)) continue;
    const hist = dwell.get(id) ?? emptyDwell();
    hist[bucket as DwellBucket] += row.count;
    dwell.set(id, hist);
  }

  const modules: AnalyticsSectionModule[] = modulesInPageOrder(store.ia.getNav(), store.ia.getModules()).map(
    ({ id, area }) => {
      const hist = dwell.get(id) ?? emptyDwell();
      const n = seen.get(id) ?? 0;
      return {
        id,
        area,
        seen: n,
        seenRate: ratio(n, loads),
        entries: entries.get(id) ?? 0,
        exits: exits.get(id) ?? 0,
        dwell: hist,
        medianDwellSeconds: medianDwell(hist)?.seconds ?? null,
      };
    },
  );

  const flow = reader
    .top("module_flow", current, MAX_FLOW)
    .flatMap((r) => {
      const [from, to] = r.key.split(">");
      return from && to ? [{ from, to, count: r.count }] : [];
    });

  const sessionCounts = new Map(reader.top("session_modules", current, SESSION_TAB_BUCKETS.length).map((r) => [r.key, r.count]));
  const sessionModules = SESSION_TAB_BUCKETS.map((bucket) => ({ bucket, count: sessionCounts.get(bucket) ?? 0 }));

  const views = new Map(reader.top("tab", current, WIDE).map((r) => [r.key, r.count]));
  const depths = new Map<string, Record<ScrollDepth, number>>();
  for (const row of reader.top("scroll", current, WIDE)) {
    const [area, depth] = row.key.split("|");
    if (!area || !depth || !(SCROLL_DEPTHS as readonly string[]).includes(depth)) continue;
    const d = depths.get(area) ?? ({ "25": 0, "50": 0, "75": 0, "100": 0 } as Record<ScrollDepth, number>);
    d[depth as ScrollDepth] += row.count;
    depths.set(area, d);
  }
  const scrollDepth = [...depths].map(([area, d]) => ({ area, views: views.get(area) ?? 0, depths: d }));

  return { loads, modules, flow, sessionModules, scrollDepth };
}

