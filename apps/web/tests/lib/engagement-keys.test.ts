import { describe, expect, it } from "vitest";
import { dwellHistograms, formatSecondPage, parseTransition, scrollFunnels } from "../../src/lib/engagement-keys";

describe("formatSecondPage", () => {
  it("shows the rounded rate and the counts behind it", () => {
    expect(formatSecondPage({ visits: 28, reached: 12, rate: 12 / 28 })).toEqual({
      value: "43%",
      detail: "12 of 28 confirmed visits",
    });
  });
  it("says so when there are no confirmed visits", () => {
    expect(formatSecondPage({ visits: 0, reached: 0, rate: null }).value).toBe("n/a");
  });
});

describe("parseTransition", () => {
  it("splits from and to", () => {
    expect(parseTransition("home>work")).toEqual({ from: "home", to: "work" });
  });
  it("rejects malformed keys", () => {
    expect(parseTransition("home")).toBeNull();
    expect(parseTransition(">work")).toBeNull();
    expect(parseTransition("home>")).toBeNull();
  });
});

describe("scrollFunnels", () => {
  it("builds a per-section funnel, accepting a trailing percent sign", () => {
    const [home] = scrollFunnels([
      { key: "home|25", count: 10 },
      { key: "home|50%", count: 6 },
      { key: "home|75", count: 3 },
    ]);
    expect(home?.section).toBe("home");
    expect(home?.steps.map((s) => [s.depth, s.count])).toEqual([
      ["25", 10],
      ["50", 6],
      ["75", 3],
      ["100", 0],
    ]);
    expect(home?.steps[1]?.share).toBeCloseTo(0.6);
  });

  it("measures against section entries when given, so bounces show", () => {
    const [work] = scrollFunnels(
      [{ key: "work|25", count: 5 }],
      [{ key: "work", count: 20 }],
    );
    expect(work?.entered).toBe(20);
    expect(work?.steps[0]?.share).toBeCloseTo(0.25);
  });

  it("caps share at 1 when entries undercount", () => {
    const [s] = scrollFunnels([{ key: "a|25", count: 9 }], [{ key: "a", count: 3 }]);
    expect(s?.steps[0]?.share).toBe(1);
  });

  it("skips malformed rows and orders sections by entry", () => {
    const funnels = scrollFunnels([
      { key: "a|25", count: 1 },
      { key: "b|25", count: 5 },
      { key: "junk", count: 9 },
      { key: "c|40", count: 9 },
    ]);
    expect(funnels.map((f) => f.section)).toEqual(["b", "a"]);
  });
});

describe("dwellHistograms", () => {
  it("fills every bucket in time order with shares", () => {
    const [home] = dwellHistograms([
      { key: "home|1-3m", count: 1 },
      { key: "home|<5s", count: 3 },
    ]);
    expect(home?.total).toBe(4);
    expect(home?.buckets.map((b) => b.bucket)).toEqual(["<5s", "5-15s", "15-30s", "30-60s", "1-3m", "3-10m", "10m+"]);
    expect(home?.buckets[0]?.share).toBe(0.75);
    expect(home?.buckets[1]?.count).toBe(0);
  });

  it("merges rows for the same section and drops unknown buckets", () => {
    const out = dwellHistograms([
      { key: "a|<5s", count: 2 },
      { key: "a|<5s", count: 1 },
      { key: "a|forever", count: 50 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.total).toBe(3);
  });
});
