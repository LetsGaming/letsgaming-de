import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUMMARY_METRICS,
  addSummary,
  beaconCoverage,
  buildFunnel,
  buildHeadline,
  confirmationRate,
  deltaPct,
  emptySummary,
  isMeasured,
  isPartiallyMeasured,
  medianVisitSeconds,
  ratio,
  sectionsPerVisit,
  summarize,
  summaryMetricsOf,
  unverifiedViews,
  type SummaryValues,
} from "../src/index.js";

const summary = (over: Partial<SummaryValues>): SummaryValues => ({ ...emptySummary(), ...over });

test("ratios are null, never a fake 0, when the denominator is 0", () => {
  assert.equal(ratio(3, 0), null);
  assert.equal(beaconCoverage(0, 0), null);
  assert.equal(confirmationRate(0, 0), null);
  assert.equal(ratio(0, 5), 0);
});

test("coverage is loads over page views and confirmation is confirmed over loads", () => {
  assert.equal(beaconCoverage(4, 10), 0.4);
  assert.equal(confirmationRate(3, 4), 0.75);
  assert.equal(beaconCoverage(12, 10), 1.2, "late-counted loads are not clamped");
});

test("unverified views are the page views no script reported on, never negative", () => {
  assert.equal(unverifiedViews(10, 4), 6);
  assert.equal(unverifiedViews(3, 5), 0);
  assert.equal(unverifiedViews(0, 0), 0);
});

test("delta percent needs a non-zero previous", () => {
  assert.equal(deltaPct(150, 100), 50);
  assert.equal(deltaPct(50, 100), -50);
  assert.equal(deltaPct(5, 0), null);
  assert.equal(deltaPct(5, null), null);
  assert.equal(deltaPct(null, 5), null);
});

test("summarize folds counter rows into the additive metrics", () => {
  const s = summarize([
    { dimension: "path", key: "/", count: 10 },
    { dimension: "path", key: "/x", count: 2 },
    { dimension: "bot", key: "Googlebot", count: 3 },
    { dimension: "probe", key: "WordPress probe", count: 1 },
    { dimension: "viewport", key: "desktop", count: 4 },
    { dimension: "visit", key: "scroll", count: 3 },
    { dimension: "session_dwell", key: "1-3m", count: 2 },
    { dimension: "session_dwell", key: "<5s", count: 1 },
    { dimension: "click", key: "nav", count: 5 },
    { dimension: "module", key: "hero", count: 7 },
    { dimension: "session_modules", key: "4+", count: 2 },
    { dimension: "browser", key: "Chrome", count: 99 },
  ]);
  assert.equal(s.pageviews, 12);
  assert.equal(s.bots, 3);
  assert.equal(s.probes, 1);
  assert.equal(s.loads, 4);
  assert.equal(s.confirmed, 3);
  assert.equal(s.completed, 3);
  assert.equal(s.sd_0, 1);
  assert.equal(s.sd_4, 2);
  assert.equal(s.clicks, 5);
  assert.equal(s.modules_seen, 7);
  assert.equal(s.sm_4, 2);
  assert.deepEqual(Object.keys(s).sort(), [...SUMMARY_METRICS].sort());
});

test("summaries add up bucket by bucket", () => {
  const sum = addSummary(summary({ pageviews: 2, sd_1: 1 }), summary({ pageviews: 3, sd_1: 2 }));
  assert.equal(sum.pageviews, 5);
  assert.equal(sum.sd_1, 3);
});

test("sections per visit and median visit length come from the bucket counts", () => {
  assert.equal(sectionsPerVisit(emptySummary()), null);
  assert.equal(sectionsPerVisit(summary({ sm_1: 2, sm_2: 2 })), 1.5);
  assert.equal(medianVisitSeconds(emptySummary()), null);
  // 1 visit under 5s, 3 at 1-3m: the median falls in 1-3m.
  assert.equal(medianVisitSeconds(summary({ sd_0: 1, sd_4: 3 })), 120);
});

test("the funnel reconciles requests, exclusions, loads and confirmations", () => {
  const f = buildFunnel(summary({ pageviews: 10, bots: 4, probes: 6, loads: 4, confirmed: 3, completed: 2 }));
  assert.deepEqual(f, {
    requests: 20,
    probes: 6,
    bots: 4,
    unverified: 6,
    loads: 4,
    confirmed: 3,
    completed: 2,
  });
});

test("confirmation is measured only from the first visit event on", () => {
  assert.equal(isMeasured(null, "2026-10-28T12"), false, "no visit event ever: nothing measured");
  assert.equal(isMeasured("2026-10-28T09", "2026-10-28T08"), false, "window ends before the cutover");
  assert.equal(isMeasured("2026-10-28T09", "2026-10-28T09"), true);
  assert.equal(isPartiallyMeasured("2026-10-28T09", "2026-10-27T00"), true);
  assert.equal(isPartiallyMeasured("2026-10-28T09", "2026-10-28T09"), false);
  assert.equal(isPartiallyMeasured(null, "2026-10-27T00"), false);
});

test("the headline carries totals, deltas and series, and marks confirmation as unmeasured", () => {
  const current = summary({ pageviews: 10, loads: 5, confirmed: 0, sm_2: 2 });
  const previous = summary({ pageviews: 5, loads: 5, confirmed: 0 });
  const unmeasured = buildHeadline({
    current,
    previous,
    series: [summary({ pageviews: 4 }), summary({ pageviews: 6 })],
    measured: false,
    previousMeasured: false,
  });
  assert.equal(unmeasured.pageviews.total, 10);
  assert.equal(unmeasured.pageviews.previous, 5);
  assert.equal(unmeasured.pageviews.deltaPct, 100);
  assert.deepEqual(unmeasured.pageviews.series, [4, 6]);
  assert.equal(unmeasured.beaconCoverage.total, 0.5);
  assert.equal(unmeasured.sectionsPerVisit.total, 2);
  assert.equal(unmeasured.confirmedVisits.measured, false);
  assert.equal(unmeasured.confirmedVisits.deltaPct, null);

  const measured = buildHeadline({
    current: summary({ confirmed: 3 }),
    previous: summary({ confirmed: 0 }),
    series: [],
    measured: true,
    previousMeasured: true,
  });
  assert.equal(measured.confirmedVisits.measured, true);
  assert.equal(measured.confirmedVisits.deltaPct, null, "previous 0 has no percentage");

  const noComparison = buildHeadline({ current, previous: null, series: [], measured: true, previousMeasured: false });
  assert.equal(noComparison.pageviews.previous, null);
  assert.equal(noComparison.pageviews.deltaPct, null);
});

test("an undefined ratio is null in total and 0 in the series", () => {
  const h = buildHeadline({
    current: emptySummary(),
    previous: emptySummary(),
    series: [emptySummary()],
    measured: true,
    previousMeasured: true,
  });
  assert.equal(h.beaconCoverage.total, null);
  assert.deepEqual(h.beaconCoverage.series, [0]);
});

test("clearing a dimension names the summary figures it feeds", () => {
  assert.deepEqual(summaryMetricsOf("path"), ["pageviews"]);
  assert.deepEqual(summaryMetricsOf("browser"), []);
  assert.ok(summaryMetricsOf("session_dwell").includes("sd_6"));
});
