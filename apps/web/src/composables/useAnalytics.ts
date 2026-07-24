import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { AuthError } from "../lib/cms";
import {
  DWELL_BUCKETS,
  VIEW_RANGES,
  CLEAR_RANGES,
  buildStackedChart,
  columnAtX,
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
/**
 * Which cards below the chart belong to which metric.
 *
 * The lists were previously fixed: selecting "Bots" still showed Top paths,
 * Referrers, Browsers and the rest — dimensions that describe *people* and are
 * empty of bots by construction, since a bot never reaches them. Scoping them to
 * the selected metric is what makes the two halves of the screen one screen.
 *
 * `everything` is the way back, and it's the default the dashboard opens on.
 */
export const CARD_GROUPS = {
  human: ["paths", "referrers", "browsers", "os", "devices"],
  machine: ["bots", "probes"],
  engagement: ["engagement"],
} as const;

export type CardScope = "everything" | keyof typeof CARD_GROUPS;

/** The card group a metric is about. */
const SCOPE_FOR_METRIC: Record<string, CardScope> = {
  pageviews: "human",
  sections: "engagement",
  clicks: "engagement",
  visitLength: "engagement",
  bots: "machine",
  probes: "machine",
};

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

/** Shared bits the analytics slice needs from the parent CMS. */
export interface AnalyticsDeps {
  /** Which panel is open — the poll runs only while this is "analytics". */
  tab: Ref<string>;
  cms: {
    saveReferrerRules: (rules: ReferrerRule[]) => Promise<unknown>;
    analytics: (hours: number, tz?: string, at?: string) => Promise<AnalyticsResponse>;
    clearAnalytics: (range: ClearRangeId) => Promise<unknown>;
  };
  authed: { value: boolean };
  flash: (msg: string) => void;
  guarded: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}

export function useAnalytics({ tab, cms, authed, flash, guarded }: AnalyticsDeps) {
  const analytics = ref<AnalyticsResponse | null>(null);
  const rangeHours = ref(72);
  /**
   * Which clock the chart is read in.
   *
   * `local` is the browser's zone, `utc` is the raw storage zone. Local is the
   * default because the only reader is the owner, and "yesterday evening" should
   * mean their evening — the chart used to be UTC-only with a caption admitting
   * it, which is an offset the reader had to carry in their head.
   */
  const zone = ref<"local" | "utc">("local");
  const browserZone =
    typeof Intl !== "undefined" ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC") : "UTC";
  const activeZone = computed(() => (zone.value === "utc" ? "UTC" : browserZone));
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
      analytics.value = await cms.analytics(rangeHours.value, activeZone.value);
      // Hydrate the editor from what's actually in effect, unless the owner is
      // mid-edit — clobbering half-typed rules on a background poll would be its
      // own small betrayal.
      if (!savingRules.value && !referrerRules.value.some((r) => !r.match || !r.label)) {
        referrerRules.value = analytics.value.referrerRules.map((r) => ({ ...r }));
      }
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
      // Only the load that raised the spinner may lower it — a quiet poll
      // landing mid-refresh used to switch it off while the manual load was
      // still running.
      if (!opts.quiet) loadingA.value = false;
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
    return buildStackedChart({
      rows: (a.chart[metric.value] ?? []) as { bucket: string; key: string; count: number }[],
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
   * whole window.
   *
   * The graph and the tables below it used to be unrelated: a spike was visible
   * and unexplainable on the same screen, because Top paths always summarised
   * the entire range. Clicking a column answers "what was that?" by re-asking
   * the same query with a one-bucket window.
   *
   * The chart itself keeps showing the full range while focused — losing the
   * context would make it impossible to click anywhere else, and the point is to
   * move around the graph, not to zoom into it.
   */
  /**
   * Which cards are shown. Follows the selected metric until the reader says
   * otherwise, and "Show everything" puts it back.
   */
  const scope = ref<CardScope>("everything");
  const pinnedScope = ref(false);
  const activeScope = computed<CardScope>(() =>
    pinnedScope.value ? scope.value : (SCOPE_FOR_METRIC[metric.value] ?? "everything"),
  );
  const showsCard = (name: string): boolean =>
    activeScope.value === "everything" ||
    (CARD_GROUPS[activeScope.value] as readonly string[]).includes(name);

  function setScope(next: CardScope) {
    scope.value = next;
    // Choosing "everything" is a request to stop following the metric; choosing
    // a group is too, just a narrower one.
    pinnedScope.value = true;
  }
  /** Back to the default: cards follow the metric again. */
  function resetScope() {
    pinnedScope.value = false;
    scope.value = "everything";
  }

  const focus = ref<string | null>(null);
  const focused = ref<AnalyticsResponse | null>(null);
  const loadingFocus = ref(false);

  /** The response the cards below the chart read from. */
  const lists = computed(() => focused.value ?? analytics.value);

  async function focusBucket(bucket: string | null) {
    focus.value = bucket;
    if (!bucket) {
      focused.value = null;
      return;
    }
    loadingFocus.value = true;
    try {
      focused.value = await cms.analytics(rangeHours.value, activeZone.value, bucket);
    } catch {
      // A failed drill-in shouldn't strand the view on a stale slice.
      focus.value = null;
      focused.value = null;
    } finally {
      loadingFocus.value = false;
    }
  }

  /** Clicking the plot focuses whichever bucket is under the pointer. */
  function selectAt(xInView: number) {
    const c = chart.value;
    const col = c ? columnAtX(c, xInView) : undefined;
    if (!col) return;
    void focusBucket(focus.value === col.bucket ? null : col.bucket);
  }

  /** Track the pointer across the plot. `xInView` is in viewBox units. */
  function hoverAt(xInView: number) {
    const c = chart.value;
    hovered.value = c ? (columnAtX(c, xInView) ?? null) : null;
  }
  function clearHover() {
    hovered.value = null;
  }
  // A range or metric change re-lays the axis; a tooltip pinned to the old one
  // would be describing a bucket that's no longer under the pointer.
  watch([metric, rangeHours], clearHover);
  // A new axis means the focused bucket may not exist any more, and a stale
  // slice under a changed chart is worse than no slice.
  watch([rangeHours, zone], () => void focusBucket(null));

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
    focus,
    focused,
    lists,
    loadingFocus,
    focusBucket,
    selectAt,
    activeScope,
    pinnedScope,
    showsCard,
    setScope,
    resetScope,
  };
}
