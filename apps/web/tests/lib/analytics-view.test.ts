import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AnalyticsSectionModule, HeadlineMetric, QualityFunnel } from "@lg/core";
import {
  EXCLUSION_LABELS,
  areaScrollFunnels,
  bucketBars,
  comparisonCaption,
  deltaView,
  dwellFromRecord,
  exclusionLabel,
  exclusionRows,
  flowRows,
  formatSeconds,
  formatTileValue,
  funnelStages,
  moduleRows,
  prettifyId,
  qualityNotes,
  sectionsEmpty,
  seriesRows,
} from "../../src/lib/analytics-view";

const metric = (over: Partial<HeadlineMetric> = {}): HeadlineMetric => ({
  total: 10,
  previous: 5,
  deltaPct: 100,
  series: [1, 2],
  measured: true,
  previousMeasured: true,
  ...over,
});

describe("deltaView", () => {
  it("shows sign and rounded percent", () => {
    expect(deltaView(18.4)).toEqual({ text: "+18%", direction: "up" });
    expect(deltaView(-4.6)).toEqual({ text: "−5%", direction: "down" });
  });
  it("renders nothing for a missing delta, never a fake 0%", () => {
    expect(deltaView(null)).toEqual({ text: "", direction: "" });
    expect(deltaView(undefined)).toEqual({ text: "", direction: "" });
    expect(deltaView(Number.NaN)).toEqual({ text: "", direction: "" });
  });
  it("shows a real zero change as flat", () => {
    expect(deltaView(0)).toEqual({ text: "0%", direction: "flat" });
    expect(deltaView(0.2).direction).toBe("flat");
  });
});

describe("formatTileValue", () => {
  it("is unmeasured, not zero, when the window predates the metric", () => {
    expect(formatTileValue("confirmedVisits", metric({ measured: false, total: 0 })).state).toBe("unmeasured");
  });
  it("is empty for an undefined ratio", () => {
    expect(formatTileValue("beaconCoverage", metric({ total: null })).state).toBe("empty");
  });
  it("formats each tile kind", () => {
    expect(formatTileValue("beaconCoverage", metric({ total: 0.426 })).text).toBe("43%");
    expect(formatTileValue("beaconCoverage", metric({ total: 0.004 })).text).toBe("<1%");
    expect(formatTileValue("sectionsPerVisit", metric({ total: 2.345 })).text).toBe("2.3");
    expect(formatTileValue("medianVisitSeconds", metric({ total: 90 })).text).toBe("1m 30s");
    expect(formatTileValue("pageviews", metric({ total: 1234 })).text).toBe("1,234");
  });
  it("formats seconds", () => {
    expect(formatSeconds(2.5)).toBe("3s");
    expect(formatSeconds(120)).toBe("2m");
    expect(formatSeconds(390)).toBe("6m 30s");
  });
});

describe("comparisonCaption", () => {
  it("names the window when there is a delta", () => {
    expect(comparisonCaption(metric(), "72h")).toBe("vs previous 72h");
  });
  it("says why there is no comparison", () => {
    expect(comparisonCaption(metric({ previous: null, deltaPct: null }), "72h")).toMatch(/no earlier/);
    expect(comparisonCaption(metric({ previousMeasured: false, deltaPct: null }), "72h")).toMatch(/not measured/);
    expect(comparisonCaption(metric({ previous: 0, deltaPct: null }), "72h")).toMatch(/no baseline/);
    expect(comparisonCaption(metric({ measured: false }), "72h")).toBe("");
  });
});

describe("seriesRows", () => {
  it("aligns the series to the axis and drops zero buckets", () => {
    const rows = seriesRows([0, 3, 0, 2], { from: "2026-07-01", to: "2026-07-04" }, "day", "visits");
    expect(rows).toEqual([
      { bucket: "2026-07-02", key: "visits", count: 3 },
      { bucket: "2026-07-04", key: "visits", count: 2 },
    ]);
  });
  it("ignores values past the axis", () => {
    expect(seriesRows([1, 1, 1], { from: "2026-07-01", to: "2026-07-01" }, "day", "v")).toHaveLength(1);
  });
});

describe("funnelStages", () => {
  const f: QualityFunnel = { requests: 100, probes: 10, bots: 20, unverified: 30, loads: 40, confirmed: 20, completed: 10 };
  it("widths are fractions of requests and page views are what remains", () => {
    const stages = funnelStages(f, true);
    const by = Object.fromEntries(stages.map((s) => [s.id, s]));
    expect(by.requests!.width).toBe(1);
    expect(by.pageviews!.count).toBe(70);
    expect(by.pageviews!.width).toBeCloseTo(0.7);
    expect(by.loads!.width).toBeCloseTo(0.4);
    expect(by.probes!.split && by.bots!.split && by.pageviews!.split).toBe(true);
    expect(by.loads!.split).toBe(false);
  });
  it("survives a zero denominator", () => {
    const zero: QualityFunnel = { requests: 0, probes: 0, bots: 0, unverified: 0, loads: 0, confirmed: 0, completed: 0 };
    for (const s of funnelStages(zero, true)) expect(s.width).toBe(0);
  });
  it("never exceeds 100 percent", () => {
    expect(funnelStages({ ...f, loads: 500 }, true).find((s) => s.id === "loads")!.width).toBe(1);
  });
  it("marks confirmed as unmeasured with no bar", () => {
    const c = funnelStages(f, false).find((s) => s.id === "confirmed")!;
    expect(c.unmeasured).toBe(true);
    expect(c.width).toBe(0);
  });
});

describe("qualityNotes", () => {
  const base = {
    funnel: { requests: 0, probes: 0, bots: 0, unverified: 0, loads: 0, confirmed: 0, completed: 0 },
    coverage: null,
    confirmationRate: null,
    confirmationSince: null,
    measured: true,
    partiallyMeasured: false,
    exclusions: [],
    approximateHistory: false,
  };
  it("unmeasured wins over partial", () => {
    expect(qualityNotes({ ...base, measured: false, partiallyMeasured: true })).toEqual({
      unmeasured: true,
      partial: false,
      approximateHistory: false,
    });
  });
  it("flags partial and approximate history", () => {
    expect(qualityNotes({ ...base, partiallyMeasured: true, approximateHistory: true })).toEqual({
      unmeasured: false,
      partial: true,
      approximateHistory: true,
    });
  });
});

describe("exclusion labels", () => {
  it("falls back to the id", () => {
    expect(exclusionLabel("brand-new-rule")).toBe("brand-new-rule");
    expect(exclusionLabel("ua-headless")).toBe(EXCLUSION_LABELS["ua-headless"]);
  });

  it("covers every rule id the server can emit", () => {
    const dir = join(__dirname, "..", "..", "..", "server", "src", "analytics");
    const read = (f: string) => readFileSync(join(dir, f), "utf8");
    const ids = new Set<string>();
    for (const file of ["classify.ts", "agent.ts", "probe.ts"]) {
      for (const m of read(file).matchAll(/\bid:\s*"([a-z0-9-]+)"/g)) ids.add(m[1]!);
    }
    for (const m of read("agent.ts").matchAll(/_RULE_ID\s*=\s*"([a-z0-9-]+)"/g)) ids.add(m[1]!);
    for (const m of read("burst.ts").matchAll(/BURST_RULE_ID\s*=\s*"([a-z0-9-]+)"/g)) ids.add(m[1]!);
    ids.add("not-found");
    expect(ids.size).toBeGreaterThan(30);
    const missing = [...ids].filter((id) => !(id in EXCLUSION_LABELS));
    expect(missing).toEqual([]);
  });

  it("builds rows with bar widths relative to the largest", () => {
    const rows = exclusionRows([
      { key: "ua-empty", count: 10 },
      { key: "mystery", count: 5 },
    ]);
    expect(rows[0]).toMatchObject({ label: EXCLUSION_LABELS["ua-empty"], width: 1 });
    expect(rows[1]).toMatchObject({ label: "mystery", width: 0.5 });
    expect(exclusionRows([])).toEqual([]);
  });
});

describe("section rows", () => {
  const mod = (over: Partial<AnalyticsSectionModule>): AnalyticsSectionModule => ({
    id: "hero",
    area: "home",
    seen: 0,
    seenRate: null,
    entries: 0,
    exits: 0,
    dwell: { "<5s": 0, "5-15s": 0, "15-30s": 0, "30-60s": 0, "1-3m": 0, "3-10m": 0, "10m+": 0 },
    medianDwellSeconds: null,
    ...over,
  });

  it("prettifies ids", () => {
    expect(prettifyId("github-activity")).toBe("Github activity");
    expect(prettifyId("githubActivity")).toBe("Github activity");
    expect(prettifyId("hero")).toBe("Hero");
  });

  it("keeps the server page order and computes widths", () => {
    const rows = moduleRows([
      mod({ id: "hero", seen: 8, seenRate: 0.8, entries: 6, exits: 2, medianDwellSeconds: 45 }),
      mod({ id: "play-time", area: "life", seen: 4, seenRate: 0.4, entries: 3, exits: 4 }),
      mod({ id: "orphan", area: null }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["hero", "play-time", "orphan"]);
    expect(rows[0]).toMatchObject({ rateText: "80%", width: 0.8, entryWidth: 1, medianDwellText: "45s" });
    expect(rows[1]).toMatchObject({ label: "Play time", areaLabel: "Life", exitWidth: 1, entryWidth: 0.5 });
    expect(rows[2]).toMatchObject({ rateText: "n/a", width: 0, areaLabel: "Not placed", entryWidth: 0 });
  });

  it("builds a dwell histogram in bucket order with shares", () => {
    const h = dwellFromRecord("hero", { "<5s": 1, "1-3m": 3 });
    expect(h.total).toBe(4);
    expect(h.buckets.map((b) => b.bucket)).toEqual(["<5s", "5-15s", "15-30s", "30-60s", "1-3m", "3-10m", "10m+"]);
    expect(h.buckets.find((b) => b.bucket === "1-3m")!.share).toBe(0.75);
    expect(dwellFromRecord("x", {}).buckets.every((b) => b.share === 0)).toBe(true);
  });

  it("caps and labels flow rows", () => {
    const flow = Array.from({ length: 12 }, (_, i) => ({ from: "hero", to: `m${i}`, count: 12 - i }));
    const rows = flowRows(flow, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ label: "Hero -> M0", count: 12, width: 1 });
  });

  it("turns buckets into shares and scroll depth into funnels", () => {
    expect(bucketBars([{ bucket: "1", count: 1 }, { bucket: "2", count: 3 }]).map((b) => b.share)).toEqual([0.25, 0.75]);
    expect(bucketBars([{ bucket: "1", count: 0 }])[0]!.share).toBe(0);
    const [home] = areaScrollFunnels([{ area: "home", views: 10, depths: { "25": 8, "50": 5, "75": 2, "100": 0 } }]);
    expect(home!.entered).toBe(10);
    expect(home!.steps.map((s) => s.share)).toEqual([0.8, 0.5, 0.2, 0]);
  });

  it("decides when the section card is empty", () => {
    const base = { loads: 5, modules: [mod({ seen: 1 })], flow: [], sessionModules: [], scrollDepth: [] };
    expect(sectionsEmpty(base)).toBe(false);
    expect(sectionsEmpty({ ...base, loads: 0 })).toBe(true);
    expect(sectionsEmpty({ ...base, modules: [mod({ seen: 0 })] })).toBe(true);
    expect(sectionsEmpty({ ...base, modules: [] })).toBe(true);
  });
});
