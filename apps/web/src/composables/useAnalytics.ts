import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { AuthError } from "../lib/cms";
import {
  VIEW_RANGES,
  CLEAR_RANGES,
  type AnalyticsResponse,
  type ClearRangeId,
} from "@lg/core";

/**
 * The analytics-dashboard slice of the CMS.
 *
 * Pulled out of `useCms` — the largest cohesive block, and the one with real
 * lifecycle: a poll that runs only while the analytics panel is open *and* the
 * tab is in front. That wiring (a `tab` watcher, a `visibilitychange` listener,
 * and an interval) now lives entirely here; the composable registers its own
 * `onMounted`/`onUnmounted`, so the parent no longer threads the poll through its
 * own lifecycle hooks. Consumption is unchanged — `useCms` spreads this into its
 * return, so the analytics panel sees the same members.
 *
 * It's handed the shared `tab` ref (to know when its panel is showing) and the
 * write helpers; everything analytics-specific is internal.
 */

const METRIC_KEYS = ["pageviews", "sections", "clicks", "visitLength", "bots"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

const METRIC_LABELS: Record<MetricKey, string> = {
  pageviews: "Page views",
  sections: "Confirmed visits",
  clicks: "Clicks",
  visitLength: "Visit length",
  bots: "Bots",
};

/** METRIC_KEYS, not `Object.keys(METRIC_LABELS) as MetricKey[]` — a cast is a
 *  check that can't fail, and the list already exists. */
const metricKeys: readonly MetricKey[] = METRIC_KEYS;

// Both lists come from core: the server switches on the same CLEAR_RANGES ids and
// derives each window from the same `hours`.
const RANGES = VIEW_RANGES;
const CLEARS = CLEAR_RANGES;

// Chart palette lives in tokens.css (--stack-1..7); referenced as CSS variables
// so the theme owns the colours and the chart carries no hard-coded hex.
const STACK_COLORS = [
  "var(--stack-1)",
  "var(--stack-2)",
  "var(--stack-3)",
  "var(--stack-4)",
  "var(--stack-5)",
  "var(--stack-6)",
  "var(--stack-7)",
];

/**
 * How often the open analytics panel refreshes itself.
 *
 * The numbers move on two clocks: the beacon writes as visitors browse, and the
 * log ingest lands every 5 minutes (ADR 0013). 30s is under both, so the panel
 * reads as live without asking anything of the server that a page reload wasn't.
 */
const ANALYTICS_POLL_MS = 30_000;

/** Round up to a "nice" number (1/2/5 × 10ⁿ) for an axis top. */
function niceCeil(v: number): number {
  if (v <= 1) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const f = v / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * base;
}
/** A "nice" step dividing `range` into roughly `count` intervals. */
function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count);
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * base;
}
/** Integer y-axis ticks 0..top for count data (min step 1, ~4 divisions). */
function yAxisTicks(max: number): { top: number; ticks: number[] } {
  const step = Math.max(1, Math.round(niceStep(niceCeil(max), 4)));
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return { top, ticks };
}

/** Enumerate the continuous bucket axis for the current range + unit. */
function axisBuckets(from: string, to: string, unit: "hour" | "day"): string[] {
  const out: string[] = [];
  if (unit === "hour") {
    const d = new Date(`${from}:00:00Z`);
    const end = new Date(`${to}:00:00Z`);
    while (d <= end) {
      out.push(d.toISOString().slice(0, 13));
      d.setUTCHours(d.getUTCHours() + 1);
    }
  } else {
    const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${to.slice(0, 10)}T00:00:00Z`);
    while (d <= end) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return out;
}

/** Shared bits the analytics slice needs from the parent CMS. */
export interface AnalyticsDeps {
  /** Which panel is open — the poll runs only while this is "analytics". */
  tab: Ref<string>;
  cms: {
    analytics: (hours: number) => Promise<AnalyticsResponse>;
    clearAnalytics: (range: ClearRangeId) => Promise<unknown>;
  };
  authed: { value: boolean };
  flash: (msg: string) => void;
  guarded: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}

export function useAnalytics({ tab, cms, authed, flash, guarded }: AnalyticsDeps) {
  const analytics = ref<AnalyticsResponse | null>(null);
  const rangeHours = ref(72);
  const metric = ref<MetricKey>("pageviews");
  const loadingA = ref(false);
  const clearing = ref(false);
  /** When the numbers on screen were fetched. Drives the "updated Ns ago" line. */
  const analyticsAt = ref(0);

  let analyticsPoll: ReturnType<typeof setInterval> | undefined;

  /**
   * Load the analytics aggregates. A *read*, so deliberately not via `guarded()`:
   * that bumps the preview key on success, which would reload the preview iframe
   * for a query that changed nothing.
   *
   * `quiet` is for the poll: no spinner, no toast. It still surfaces an expired
   * session, because a poll that 401s every 30s forever is worse than saying so.
   */
  async function loadAnalytics(opts: { quiet?: boolean } = {}) {
    if (!opts.quiet) loadingA.value = true;
    try {
      analytics.value = await cms.analytics(rangeHours.value);
      analyticsAt.value = Date.now();
    } catch (e) {
      if (e instanceof AuthError) {
        authed.value = false;
        stopAnalyticsPoll();
        flash("Session expired — sign in again.");
      } else if (!opts.quiet) {
        flash((e as Error).message || "Couldn't load analytics.");
      }
    } finally {
      loadingA.value = false;
    }
  }

  function stopAnalyticsPoll() {
    if (analyticsPoll !== undefined) clearInterval(analyticsPoll);
    analyticsPoll = undefined;
  }

  /** Poll only while the panel is open *and* the tab is in front. */
  function syncAnalyticsPoll() {
    const wanted =
      tab.value === "analytics" && typeof document !== "undefined" && !document.hidden;
    if (!wanted) return stopAnalyticsPoll();
    if (analyticsPoll !== undefined) return; // already running
    analyticsPoll = setInterval(() => void loadAnalytics({ quiet: true }), ANALYTICS_POLL_MS);
  }

  /** Coming back to the tab: refresh now rather than waiting out the interval. */
  function onVisibility() {
    if (typeof document === "undefined") return;
    if (!document.hidden && tab.value === "analytics") void loadAnalytics({ quiet: true });
    syncAnalyticsPoll();
  }

  /** The manual one. Restarts the interval so an explicit refresh buys a full
   *  period rather than a poll landing a second later. */
  function refreshAnalytics() {
    stopAnalyticsPoll();
    void loadAnalytics().then(syncAnalyticsPoll);
  }

  function setRange(h: number) {
    rangeHours.value = h;
    refreshAnalytics();
  }

  async function clearRange(range: ClearRangeId, label: string) {
    if (!confirm(`Delete analytics for ${label}? This can't be undone.`)) return;
    clearing.value = true;
    await guarded(async () => {
      await cms.clearAnalytics(range);
      await loadAnalytics();
    }, "");
    clearing.value = false;
  }

  const metricTotals = computed<Record<MetricKey, number>>(() => {
    const c = analytics.value?.chart;
    const sum = (a?: unknown) =>
      (Array.isArray(a) ? a : []).reduce((s: number, r: { count: number }) => s + r.count, 0);
    return {
      pageviews: sum(c?.pageviews),
      sections: sum(c?.sections),
      clicks: sum(c?.clicks),
      visitLength: sum(c?.visitLength),
      bots: sum(c?.bots),
    };
  });

  /** Stacked-area geometry for the selected metric (composition over time). */
  const chart = computed(() => {
    const a = analytics.value;
    if (!a?.chart) return null;
    const rows = (a.chart[metric.value] ?? []) as { bucket: string; key: string; count: number }[];
    const unit = a.chart.unit as "hour" | "day";
    const buckets = axisBuckets(a.range.from, a.range.to, unit);
    const idx = new Map(buckets.map((b, i) => [b, i]));

    // keys ordered by total desc, capped to 6 (+ "other")
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.key, (totals.get(r.key) ?? 0) + r.count);
    let keys = [...totals.entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]);
    const overflow = keys.slice(6);
    keys = keys.slice(0, 6);
    const remap = (k: string) => (overflow.includes(k) ? "other" : k);
    if (overflow.length) keys.push("other");

    // matrix[keyIndex][bucketIndex]
    const matrix = keys.map(() => new Array(buckets.length).fill(0));
    for (const r of rows) {
      const bi = idx.get(r.bucket);
      if (bi == null) continue;
      const ki = keys.indexOf(remap(r.key));
      if (ki >= 0) matrix[ki][bi] += r.count;
    }

    const colTotals = buckets.map((_, bi) => keys.reduce((s, _k, ki) => s + matrix[ki][bi], 0));
    const max = Math.max(1, ...colTotals);

    // Plot box with margins so the axes have room for labels.
    const W = 720;
    const H = 210;
    const M = { l: 38, r: 12, t: 12, b: 34 };
    const x0 = M.l;
    const x1 = W - M.r;
    const y0 = M.t;
    const y1 = H - M.b;
    const n = buckets.length;
    const { top: yTop, ticks: yTickVals } = yAxisTicks(max);
    const xAt = (i: number) => (n <= 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0));
    const yAt = (v: number) => y1 - (v / yTop) * (y1 - y0);

    // Build stacked layer paths (bottom-up).
    const cum = new Array(buckets.length).fill(0);
    const layers = keys.map((key, ki) => {
      const lower = cum.slice();
      for (let bi = 0; bi < buckets.length; bi++) cum[bi] += matrix[ki][bi];
      const top = cum.map((v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
      const bottom = lower
        .map((_, i) => `L${xAt(buckets.length - 1 - i).toFixed(1)} ${yAt(lower[buckets.length - 1 - i]).toFixed(1)}`)
        .join(" ");
      return {
        key,
        color: STACK_COLORS[ki % STACK_COLORS.length],
        total: matrix[ki].reduce((s: number, v: number) => s + v, 0),
        path: `${top} ${bottom} Z`,
      };
    });

    const total = colTotals.reduce((s, v) => s + v, 0);
    const labelFmt = (b: string) => (unit === "hour" ? `${b.slice(5, 10)} ${b.slice(11)}h` : b.slice(5));

    // Y ticks: value + pixel row + label (for gridlines and the count scale).
    const yTicks = yTickVals.map((v) => ({ v, y: +yAt(v).toFixed(1), label: String(v) }));
    // X ticks: a readable subset (~6) across the buckets, first & last always shown.
    const targetX = Math.min(n, 6);
    const stepX = Math.max(1, Math.round((n - 1) / Math.max(1, targetX - 1)));
    const xTicks: { x: number; label: string; anchor: "start" | "middle" | "end" }[] = [];
    for (let i = 0; i < n; i += stepX)
      xTicks.push({ x: +xAt(i).toFixed(1), label: labelFmt(buckets[i]!), anchor: "middle" });
    if (n > 1 && (n - 1) % stepX !== 0)
      xTicks.push({ x: +xAt(n - 1).toFixed(1), label: labelFmt(buckets[n - 1]!), anchor: "middle" });
    if (xTicks.length) {
      xTicks[0]!.anchor = "start";
      xTicks[xTicks.length - 1]!.anchor = "end";
    }

    return {
      W,
      H,
      x0,
      x1,
      y0,
      y1,
      layers,
      max,
      total,
      unit,
      yTicks,
      xTicks,
      fromLabel: labelFmt(buckets[0] ?? a.range.from),
      toLabel: labelFmt(buckets[n - 1] ?? a.range.to),
    };
  });

  // Lifecycle: the poll follows the open panel and the tab's visibility. Owning
  // its own watcher and listeners keeps all the timing in one place.
  watch(tab, syncAnalyticsPoll);
  onMounted(() => {
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  });
  onUnmounted(() => {
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    stopAnalyticsPoll();
  });

  return {
    METRIC_LABELS,
    metricKeys,
    RANGES,
    CLEARS,
    STACK_COLORS,
    analytics,
    rangeHours,
    metric,
    loadingA,
    clearing,
    analyticsAt,
    loadAnalytics,
    refreshAnalytics,
    setRange,
    clearRange,
    axisBuckets,
    metricTotals,
    chart,
  };
}
