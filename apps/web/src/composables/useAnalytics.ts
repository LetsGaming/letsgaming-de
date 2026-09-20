import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { AuthError } from "../lib/cms";
import {
  ANALYTICS_DIMENSIONS,
  DWELL_BUCKETS,
  VIEW_RANGES,
  CLEAR_RANGES,
  buildStackedChart,
  columnAtX,
  type AnalyticsDimension,
  type AnalyticsResponse,
  type ReferrerRule,
  type ChartColumn,
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

const METRIC_KEYS = ["pageviews", "sections", "clicks", "visitLength", "bots", "probes"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

/**
 * What each tile is called, and what its headline number actually counts.
 *
 * Two of these were wrong, in a way that made the dashboard confidently
 * misreport its own traffic:
 *
 * - `sections` is the `tab` dimension, emitted on every section entry — several
 *   per visitor. It was labelled "Confirmed visits", so the number shown as a
 *   visit count was inflated by however many sections people browsed.
 * - `visitLength` is `session_dwell`, emitted exactly once per visit (in the
 *   tracker's `end()`, behind an `ended` guard). Summing it gives the number of
 *   visits, not a length — so the tile labelled "Visit length" was showing the
 *   visit count, and the real visit count had no tile of its own.
 *
 * Both now say what they hold. Visit *length* is a distribution across dwell
 * buckets, so its headline is the median bucket rather than a sum — adding up
 * bucket labels was never going to mean anything.
 */
const METRIC_LABELS: Record<MetricKey, string> = {
  pageviews: "Page views",
  sections: "Section views",
  clicks: "Clicks",
  visitLength: "Visits",
  bots: "Bots",
  probes: "Probes",
};

/** The sub-label under each headline number, naming the unit it's counted in. */
const METRIC_UNITS: Record<MetricKey, string> = {
  pageviews: "from the access log",
  sections: "sections opened",
  clicks: "tracked elements",
  visitLength: "completed visits",
  bots: "crawler hits",
  probes: "scans, not people",
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
export const STACK_COLORS = [
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

/**
 * Human labels for the dimensions a card can be filtered by. Only the seven
 * top-list dimensions are selectable for now (see `AnalyticsPanel.vue`) — the
 * eleven engagement dimensions stay unfiltered, so they don't need a label
 * here.
 */
const DIMENSION_LABELS: Partial<Record<AnalyticsDimension, string>> = {
  path: "Path",
  referrer: "Referrer",
  browser: "Browser",
  os: "OS",
  device: "Device",
  bot: "Bot",
  probe: "Probe",
};

/**
 * The filter state as it round-trips through the URL — the CMS hash's own
 * query string (`#analytics?hours=168&dim=referrer&key=Bing`), independent of
 * the `tz`/`dim`/`key` the request itself sends (`windowArgs` below builds
 * that separately from these same refs).
 */
interface UrlFilters {
  rangeHours: number;
  customRange: { from: string; to: string } | null;
  zone: "local" | "utc";
  metric: MetricKey;
  at: string | null;
  filterDim: AnalyticsDimension | null;
  filterKey: string | null;
}

/** Parse the hash's query string. Invalid or unknown values fall back to the
 *  default rather than throwing — a hand-typed deep link should render as the
 *  closest sane view, not a blank panel. */
function decodeUrlFilters(p: URLSearchParams): UrlFilters {
  const from = p.get("from");
  const to = p.get("to");
  const customRange = from && to ? { from, to } : null;
  const hoursRaw = Number(p.get("hours"));
  const rangeHours = !customRange && Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : 72;
  const zone: "local" | "utc" = p.get("zone") === "utc" ? "utc" : "local";
  const metricRaw = p.get("metric");
  const metric = (METRIC_KEYS as readonly string[]).includes(metricRaw ?? "")
    ? (metricRaw as MetricKey)
    : "pageviews";
  const at = p.get("at");
  const dimRaw = p.get("dim");
  const keyRaw = p.get("key");
  const validDim =
    dimRaw && (ANALYTICS_DIMENSIONS as readonly string[]).includes(dimRaw) ? (dimRaw as AnalyticsDimension) : null;
  const filterDim = validDim && keyRaw ? validDim : null;
  const filterKey = filterDim ? keyRaw : null;
  return { rangeHours, customRange, zone, metric, at, filterDim, filterKey };
}

/** The inverse of `decodeUrlFilters` — omits anything at its default so the
 *  common case (no filters) stays a bare `#analytics`. */
function encodeUrlFilters(f: UrlFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.customRange) {
    p.set("from", f.customRange.from);
    p.set("to", f.customRange.to);
  } else if (f.rangeHours !== 72) {
    p.set("hours", String(f.rangeHours));
  }
  if (f.zone !== "local") p.set("zone", f.zone);
  if (f.metric !== "pageviews") p.set("metric", f.metric);
  if (f.at) p.set("at", f.at);
  if (f.filterDim && f.filterKey) {
    p.set("dim", f.filterDim);
    p.set("key", f.filterKey);
  }
  return p;
}

function urlFiltersEqual(a: UrlFilters, b: UrlFilters): boolean {
  return (
    a.rangeHours === b.rangeHours &&
    a.zone === b.zone &&
    a.metric === b.metric &&
    a.at === b.at &&
    a.filterDim === b.filterDim &&
    a.filterKey === b.filterKey &&
    (a.customRange?.from ?? null) === (b.customRange?.from ?? null) &&
    (a.customRange?.to ?? null) === (b.customRange?.to ?? null)
  );
}

/** Shared bits the analytics slice needs from the parent CMS. */
export interface AnalyticsDeps {
  /** Which panel is open — the poll runs only while this is "analytics". */
  tab: Ref<string>;
  cms: {
    saveReferrerRules: (rules: ReferrerRule[]) => Promise<unknown>;
    analytics: (opts: {
      hours?: number;
      tz?: string;
      at?: string;
      from?: string;
      to?: string;
      dim?: string;
      key?: string;
    }) => Promise<AnalyticsResponse>;
    clearAnalytics: (range: ClearRangeId) => Promise<unknown>;
  };
  authed: { value: boolean };
  flash: (msg: string) => void;
  guarded: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  /** The CMS hash's query string, and how to write it — see `UrlFilters`. */
  params: Ref<URLSearchParams>;
  setParams: (next: URLSearchParams, push?: boolean) => void;
}

export function useAnalytics({ tab, cms, authed, flash, guarded, params, setParams }: AnalyticsDeps) {
  const analytics = ref<AnalyticsResponse | null>(null);

  /**
   * The initial filter state, decoded once from whatever the hash's query
   * string already held when this composable was built. Synchronous, not
   * read inside `onMounted`: the first analytics load fires from
   * `useCmsNav`'s own `onMounted` (via `pick` → `onOpen`), which runs before
   * any `onMounted` registered here ever would — so by the time that first
   * load's `windowArgs()` runs, these refs need to already hold the restored
   * values, not still be sitting at their defaults.
   */
  const restored = decodeUrlFilters(params.value);

  const rangeHours = ref(restored.rangeHours);
  /**
   * An arbitrary from/to span, replacing the `rangeHours` presets while set.
   * Mutually exclusive with `rangeHours` in what's actually queried — picking
   * a preset (`setRange`) clears this, and picking a custom range doesn't
   * touch `rangeHours`, so switching back to presets remembers the last one.
   */
  const customRange = ref<{ from: string; to: string } | null>(restored.customRange);
  /**
   * Which clock the chart is read in.
   *
   * `local` is the browser's zone, `utc` is the raw storage zone. Local is the
   * default because the only reader is the owner, and "yesterday evening" should
   * mean their evening — the chart used to be UTC-only with a caption admitting
   * it, which is an offset the reader had to carry in their head.
   */
  const zone = ref<"local" | "utc">(restored.zone);
  const browserZone =
    typeof Intl !== "undefined" ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC") : "UTC";
  const activeZone = computed(() => (zone.value === "utc" ? "UTC" : browserZone));
  const metric = ref<MetricKey>(restored.metric);
  const loadingA = ref(false);
  const clearing = ref(false);
  /** When the numbers on screen were fetched. Drives the "updated Ns ago" line. */
  const analyticsAt = ref(0);
  /**
   * True while the CMS's own fetch to the analytics endpoint is failing —
   * distinct from `analytics.value.ingest`, which reports the *server's*
   * access-log ingest health and can be fine even while this is broken (or
   * vice versa: the API can answer perfectly well while ingest has stalled).
   * The quiet 30s poll used to swallow this outright, so a real outage read
   * identically to an ordinary quiet day. Cleared the moment a load succeeds.
   */
  const pollFailing = ref(false);

  /**
   * A single time bucket the LISTS (not the chart) are narrowed to — set by
   * clicking a column in the chart. `null` means the whole window.
   */
  const at = ref<string | null>(restored.at);
  /**
   * A dimension filter — set by clicking a row in one of the seven top-list
   * cards. Both-or-neither with `filterKey`. Replaces what the chart plots
   * and what one headline tile counts (`analytics.value.filtered`); it does
   * not narrow the list cards, and can't be crossed with any other dimension
   * — the aggregates keep no link between one dimension's rows and another's
   * (ADR-0007).
   */
  const filterDim = ref<AnalyticsDimension | null>(restored.filterDim);
  const filterKey = ref<string | null>(restored.filterKey);

  let analyticsPoll: ReturnType<typeof setInterval> | undefined;
  /** Bumped on every `loadAnalytics()` call; a response is applied only if it
   *  still matches the latest id when it lands, so a slow response to a
   *  since-superseded request (two fast filter clicks, a poll racing a manual
   *  refresh) can't overwrite what a newer one already delivered. */
  let reqId = 0;

  /** The window currently in effect — a custom span if one's set, else the
   *  selected preset — plus the reader's zone and the active bucket/dimension
   *  filters, if any. One place that decides what's sent, so the request and
   *  the URL (which mirrors this) can't drift apart. */
  function windowArgs() {
    return {
      ...(customRange.value ? { from: customRange.value.from, to: customRange.value.to } : { hours: rangeHours.value }),
      tz: activeZone.value,
      ...(at.value ? { at: at.value } : {}),
      ...(filterDim.value && filterKey.value ? { dim: filterDim.value, key: filterKey.value } : {}),
    };
  }

  /** The same state `windowArgs` reads, shaped for the URL instead of the
   *  request — kept as its own function rather than reused from `windowArgs`
   *  because the two diverge (the request's `tz` is a resolved IANA zone; the
   *  URL's `zone` is the raw local/utc toggle). */
  function currentUrlFilters(): UrlFilters {
    return {
      rangeHours: rangeHours.value,
      customRange: customRange.value,
      zone: zone.value,
      metric: metric.value,
      at: at.value,
      filterDim: filterDim.value,
      filterKey: filterKey.value,
    };
  }

  /** Write the current filters to the hash. `push` for a drill-in the reader
   *  would want Back to undo (a bucket click, a dimension filter); replace
   *  (the default) for a knob twiddle (range, zone, metric) that shouldn't
   *  bury Back under every click. */
  function syncUrl(push = false) {
    setParams(encodeUrlFilters(currentUrlFilters()), push);
  }

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
    const id = ++reqId;
    try {
      const result = await cms.analytics(windowArgs());
      if (id !== reqId) return; // a newer request already landed or is in flight
      analytics.value = result;
      pollFailing.value = false;
      // Hydrate the editor from what's actually in effect, unless the owner is
      // mid-edit — clobbering half-typed rules on a background poll would be its
      // own small betrayal.
      if (!savingRules.value && !referrerRules.value.some((r) => !r.match || !r.label)) {
        referrerRules.value = result.referrerRules.map((r) => ({ ...r }));
      }
      analyticsAt.value = Date.now();
    } catch (e) {
      if (id !== reqId) return; // stale error — a newer request is already in flight
      if (e instanceof AuthError) {
        authed.value = false;
        stopAnalyticsPoll();
        flash("Session expired — sign in again.");
      } else {
        // Set regardless of `quiet` — a background poll failing is exactly
        // the case this exists to catch. Only the toast is quiet-gated.
        pollFailing.value = true;
        if (!opts.quiet) flash((e as Error).message || "Couldn't load analytics.");
      }
    } finally {
      // Only the request that's still current, and only the load that raised
      // the spinner, may lower it — a stale or quiet poll landing mid-refresh
      // used to switch it off while the manual load was still running.
      if (id === reqId && !opts.quiet) loadingA.value = false;
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
    // Picking a preset is a way back from a custom span.
    customRange.value = null;
    // A bucket picked on the old axis may not exist on the new one; a
    // dimension filter isn't axis-bound, so it survives a range change.
    at.value = null;
    syncUrl();
    refreshAnalytics();
  }

  /** Switch to an arbitrary from/to span. Validated shape only (`YYYY-MM-DD`,
   *  `from` not after `to`) — the server is the real authority on the max
   *  span and rejects anything wider with a flashed error. */
  function setCustomRange(from: string, to: string) {
    if (!from || !to || from > to) {
      flash("Pick a start date on or before the end date.");
      return;
    }
    customRange.value = { from, to };
    at.value = null;
    syncUrl();
    refreshAnalytics();
  }

  /** Back to the preset ranges — `rangeHours` was never touched, so this
   *  resumes whichever preset was last selected. */
  function clearCustomRange() {
    customRange.value = null;
    at.value = null;
    syncUrl();
    refreshAnalytics();
  }

  /**
   * Custom referrer rules, editable here rather than in a content panel because
   * this is where you find out you need one: an unrecognised host showing up in
   * the list is the prompt to name it.
   *
   * Saving refetches, since the grouping happens server-side on read — which is
   * also why a new rule relabels traffic that arrived before it existed.
   */
  const referrerRules = ref<ReferrerRule[]>([]);
  const savingRules = ref(false);

  function addReferrerRule() {
    referrerRules.value.push({ match: "", label: "" });
  }
  function removeReferrerRule(i: number) {
    referrerRules.value.splice(i, 1);
  }
  async function saveReferrerRules() {
    savingRules.value = true;
    await guarded(async () => {
      const rules = referrerRules.value.filter((r) => r.match.trim() && r.label.trim());
      await cms.saveReferrerRules(rules);
      referrerRules.value = rules;
      await loadAnalytics();
    }, "Referrer rules saved.");
    savingRules.value = false;
  }

  /** Switching clocks re-groups day columns server-side, so it's a refetch. */
  function setZone(z: "local" | "utc") {
    if (z === zone.value) return;
    zone.value = z;
    at.value = null;
    syncUrl();
    refreshAnalytics();
  }

  async function clearRange(range: ClearRangeId, label: string) {
    if (!confirm(`Delete analytics for ${label}? This can't be undone.`)) return;
    clearing.value = true;
    // The endpoint answers with how many rows it removed, and that number is the
    // only confirmation an irreversible delete gets. It used to be discarded,
    // with an empty success message on top — so clearing everything looked
    // exactly like clearing nothing.
    let removed = 0;
    await guarded(async () => {
      const res = (await cms.clearAnalytics(range)) as { removed?: number };
      removed = res?.removed ?? 0;
      await loadAnalytics();
    }, "");
    clearing.value = false;
    flash(removed ? `Cleared ${removed} rows (${label}).` : `Nothing to clear for ${label}.`);
  }

  const metricTotals = computed<Record<MetricKey, number>>(() => {
    const c = analytics.value?.chart;
    const sum = (a?: unknown) =>
      (Array.isArray(a) ? a : []).reduce((s: number, r: { count: number }) => s + r.count, 0);
    return {
      pageviews: sum(c?.pageviews),
      sections: sum(c?.sections),
      clicks: sum(c?.clicks),
      // One `session_dwell` row per visit, so its sum is the visit count.
      visitLength: sum(c?.visitLength),
      bots: sum(c?.bots),
      probes: sum(c?.probes),
    };
  });

  /**
   * This window against the one before it, per metric.
   *
   * `null` when the server sent no previous window — it omits it rather than
   * zeroing, so "nothing to compare against" stays distinguishable from "down
   * 100%", which is what a fresh install would otherwise report forever.
   */
  const comparison = computed<Record<MetricKey, { delta: number; pct: number | null }> | null>(() => {
    const prev = analytics.value?.previous;
    if (!prev) return null;
    const out = {} as Record<MetricKey, { delta: number; pct: number | null }>;
    for (const k of METRIC_KEYS) {
      const before = prev[k];
      const now = metricTotals.value[k];
      // A rise from zero has no percentage — reporting +∞% or +100% would both
      // be inventions. The absolute delta still says something true.
      out[k] = { delta: now - before, pct: before > 0 ? ((now - before) / before) * 100 : null };
    }
    return out;
  });

  /**
   * The median visit-length bucket — the honest headline for a distribution.
   *
   * Walks the ordered dwell buckets accumulating visits until it passes the
   * halfway point, so the answer is a real bucket somebody actually fell into.
   * Empty when there are no completed visits, rather than defaulting to the
   * shortest bucket and implying everyone bounced.
   */
  const medianVisitLength = computed<string>(() => {
    const rows = analytics.value?.chart?.visitLength ?? [];
    const byBucket = new Map<string, number>();
    for (const r of rows) byBucket.set(r.key, (byBucket.get(r.key) ?? 0) + r.count);
    const total = [...byBucket.values()].reduce((s, v) => s + v, 0);
    if (!total) return "";
    let seen = 0;
    for (const bucket of DWELL_BUCKETS) {
      seen += byBucket.get(bucket) ?? 0;
      if (seen * 2 >= total) return bucket;
    }
    return "";
  });

  /**
   * Stacked-area geometry for the selected metric. The maths is `@lg/core`'s
   * `buildStackedChart` — pure, and unit-tested against exact output; this only
   * chooses which rows to hand it.
   */
  const chart = computed(() => {
    const a = analytics.value;
    if (!a?.chart) return null;
    // A dimension filter replaces the plotted series: `filtered.series` may
    // carry several distinct stored keys (a referrer label can expand to
    // several raw hosts), but they're all one filter, so they're relabelled
    // to the filter's own key here — `buildStackedChart` sums same-bucket,
    // same-key rows, so this collapses them into the single band a filter
    // implies rather than drawing them as unrelated legend entries.
    const f = a.filtered;
    const rows = f
      ? f.series.map((r) => ({ bucket: r.bucket, key: f.key, count: r.count }))
      : ((a.chart[metric.value] ?? []) as { bucket: string; key: string; count: number }[]);
    return buildStackedChart({
      rows,
      from: a.range.from,
      to: a.range.to,
      unit: a.chart.unit as "hour" | "day",
      timeZone: a.range.timeZone,
    });
  });

  // ── hover ───────────────────────────────────────────────────────────────────
  //
  // The chart used to carry one native `<title>` per layer holding that layer's
  // whole-range total, which reads like a per-point value and never changes as
  // you move along the axis. Pointer position now resolves to a bucket, and the
  // panel shows what every series did *there*.
  const hovered = ref<ChartColumn | null>(null);

  /**
   * The bucket the lists underneath the chart are describing, or null for the
   * whole window. The chart itself keeps showing the full range — losing the
   * context would make it impossible to click anywhere else, and the point is
   * to move around the graph, not to zoom into it. One request now serves
   * both (see `windowArgs`/the server's `listFromB`/`listToB` split), so
   * there's no second fetch to go stale or race the first.
   */
  function setAt(bucket: string | null) {
    at.value = bucket;
    syncUrl(true);
    refreshAnalytics();
  }

  /** Clicking the plot selects (or, clicking again, clears) the bucket under
   *  the pointer. */
  function selectAt(xInView: number) {
    const c = chart.value;
    const col = c ? columnAtX(c, xInView) : undefined;
    if (!col) return;
    setAt(at.value === col.bucket ? null : col.bucket);
  }

  /** The chart column `at` currently names, once the chart has geometry for
   *  it — used for the filter chip's human label. */
  const atColumn = computed(() =>
    at.value ? (chart.value?.columns.find((c) => c.bucket === at.value) ?? null) : null,
  );
  const atLabel = computed(() => atColumn.value?.label ?? at.value ?? "");

  /**
   * Set (or, clicking the same row again, clear) a dimension filter — what a
   * click on a selectable card row sends. See `AnalyticsResponse.filtered`'s
   * doc comment for what this can and can't do.
   */
  function selectDimension(dimension: AnalyticsDimension, key: string) {
    if (filterDim.value === dimension && filterKey.value === key) {
      clearDimensionFilter();
      return;
    }
    filterDim.value = dimension;
    filterKey.value = key;
    syncUrl(true);
    refreshAnalytics();
  }
  function clearDimensionFilter() {
    filterDim.value = null;
    filterKey.value = null;
    syncUrl(true);
    refreshAnalytics();
  }

  /** Everything currently active, as removable chips — the one filter bar
   *  replacing the old scope bar's three differently-behaved reset links. */
  const chips = computed(() => {
    const list: { id: string; label: string; clear: () => void }[] = [];
    if (customRange.value) {
      list.push({
        id: "range",
        label: `${customRange.value.from} – ${customRange.value.to}`,
        clear: clearCustomRange,
      });
    }
    if (at.value) {
      list.push({ id: "at", label: atLabel.value, clear: () => setAt(null) });
    }
    if (filterDim.value && filterKey.value) {
      list.push({
        id: "filter",
        label: `${DIMENSION_LABELS[filterDim.value] ?? filterDim.value}: ${filterKey.value}`,
        clear: clearDimensionFilter,
      });
    }
    return list;
  });

  /** Every active filter, gone in one request rather than three. */
  function clearFilters() {
    customRange.value = null;
    at.value = null;
    filterDim.value = null;
    filterKey.value = null;
    syncUrl(true);
    refreshAnalytics();
  }

  /**
   * The filtered dimension's total against its comparison window, in the same
   * `{ delta, pct }` shape as `comparison` — the headline tile for a
   * dimension filter reads it the same way the six metric tiles read
   * `comparison`.
   */
  const filteredComparison = computed<{ delta: number; pct: number | null } | null>(() => {
    const f = analytics.value?.filtered;
    if (!f || f.previous == null) return null;
    const delta = f.total - f.previous;
    return { delta, pct: f.previous > 0 ? (delta / f.previous) * 100 : null };
  });

  /** Track the pointer across the plot. `xInView` is in viewBox units. */
  function hoverAt(xInView: number) {
    const c = chart.value;
    hovered.value = c ? (columnAtX(c, xInView) ?? null) : null;
  }
  function clearHover() {
    hovered.value = null;
  }
  // A range or metric change re-lays the axis; a tooltip pinned to the old one
  // would be describing a bucket that's no longer under the pointer. (`at`
  // itself is cleared directly inside `setRange`/`setCustomRange`/`setZone`,
  // alongside the one refetch each already does — a second watcher here would
  // only cost a second, redundant request.)
  watch([metric, rangeHours, customRange], clearHover);
  // The metric selector has no dedicated setter (the template just assigns
  // `metric = k`), so its URL sync lives here rather than inline. Client-only
  // and display-only, so a replace — not worth a history entry of its own.
  //
  // Restoring `metric` from an external params change (below) also passes
  // through this watcher and re-encodes — a second `replaceState` with the
  // same content, since the refs already match. Harmless (no second history
  // entry, no second request) and self-terminating: `urlFiltersEqual` catches
  // it on the resulting `params` watcher re-run, so it stops after one bounce
  // rather than tracking an extra flag to suppress it.
  watch(metric, () => syncUrl());

  /**
   * The hash's query string changing from outside a call this composable made
   * itself — Back/Forward, or a reader editing the address bar. `setParams`
   * (called from every setter above) already updated these refs directly and
   * synchronously, so by the time this watcher's queued callback runs, a
   * self-triggered change decodes back to exactly the current state and
   * `urlFiltersEqual` skips it; only a genuinely external change reaches
   * `refreshAnalytics()`.
   */
  watch(params, (p) => {
    const decoded = decodeUrlFilters(p);
    if (urlFiltersEqual(decoded, currentUrlFilters())) return;
    rangeHours.value = decoded.rangeHours;
    customRange.value = decoded.customRange;
    zone.value = decoded.zone;
    metric.value = decoded.metric;
    at.value = decoded.at;
    filterDim.value = decoded.filterDim;
    filterKey.value = decoded.filterKey;
    refreshAnalytics();
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
    METRIC_UNITS,
    medianVisitLength,
    referrerRules,
    savingRules,
    addReferrerRule,
    removeReferrerRule,
    saveReferrerRules,
    metricKeys,
    RANGES,
    CLEARS,
    STACK_COLORS,
    analytics,
    rangeHours,
    customRange,
    setCustomRange,
    clearCustomRange,
    pollFailing,
    metric,
    loadingA,
    clearing,
    analyticsAt,
    loadAnalytics,
    refreshAnalytics,
    setRange,
    clearRange,
    metricTotals,
    comparison,
    zone,
    activeZone,
    setZone,
    chart,
    hovered,
    hoverAt,
    clearHover,
    at,
    atLabel,
    setAt,
    selectAt,
    filterDim,
    filterKey,
    selectDimension,
    clearDimensionFilter,
    filteredComparison,
    chips,
    clearFilters,
  };
}
