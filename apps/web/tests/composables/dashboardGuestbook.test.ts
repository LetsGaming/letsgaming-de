import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferredDelete } from "../../src/composables/deferredDelete";
import { createPoller, type VisibilityDoc } from "../../src/composables/poller";
import { relativeTime } from "../../src/lib/relativeTime";
import { statsPlacement, type SectionStat } from "../../src/lib/sectionStats";
import { visitsSummary } from "../../src/lib/dashboardData";
import type { AnalyticsResponse } from "@lg/core";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("deferred delete", () => {
  it("commits only after the undo window", async () => {
    const commit = vi.fn();
    const d = createDeferredDelete<number>({ commit, delayMs: 6000 });
    await d.schedule(1);
    vi.advanceTimersByTime(5999);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(commit).toHaveBeenCalledWith(1));
    expect(d.held).toBeNull();
  });

  it("undo returns the item and never calls the server", async () => {
    const commit = vi.fn();
    const d = createDeferredDelete<number>({ commit });
    await d.schedule(7);
    expect(d.undo()).toBe(7);
    vi.advanceTimersByTime(10_000);
    expect(commit).not.toHaveBeenCalled();
    expect(d.undo()).toBeNull();
  });

  it("starting another delete commits the previous one first", async () => {
    const commit = vi.fn();
    const d = createDeferredDelete<number>({ commit });
    await d.schedule(1);
    await d.schedule(2);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(1);
    expect(d.held).toBe(2);
  });

  it("flush commits immediately (page unload)", async () => {
    const commit = vi.fn();
    const d = createDeferredDelete<number>({ commit });
    await d.schedule(3);
    await d.flush();
    expect(commit).toHaveBeenCalledWith(3);
    vi.advanceTimersByTime(10_000);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

function fakeDoc(): VisibilityDoc & { setHidden(h: boolean): void } {
  const listeners = new Set<() => void>();
  const doc = {
    hidden: false,
    addEventListener: (_: string, cb: () => void) => void listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => void listeners.delete(cb),
    setHidden(h: boolean) {
      doc.hidden = h;
      listeners.forEach((cb) => cb());
    },
  };
  return doc;
}

describe("shared poller", () => {
  it("ticks while visible, pauses while hidden, refreshes on return", () => {
    const fn = vi.fn();
    const doc = fakeDoc();
    const p = createPoller(fn, 1000, doc);
    p.start();
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
    doc.setHidden(true);
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(3);
    doc.setHidden(false);
    expect(fn).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(5);
    p.stop();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("start is idempotent so one timer is shared", () => {
    const fn = vi.fn();
    const p = createPoller(fn, 1000, fakeDoc());
    p.start();
    p.start();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    p.stop();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");
  it.each([
    [null, "never"],
    ["2026-01-10T11:59:50Z", "just now"],
    ["2026-01-10T11:55:00Z", "5m ago"],
    ["2026-01-10T09:00:00Z", "3h ago"],
    ["2026-01-08T12:00:00Z", "2d ago"],
  ])("%s -> %s", (iso, out) => expect(relativeTime(iso, now)).toBe(out));
});

describe("stats placement", () => {
  const stat = (modules: string[]): SectionStat => ({
    key: "home",
    modules,
    views: 5,
    medianDwellSeconds: 10,
    medianDwellBucket: "5-15s",
    reach: 0.5,
    depth: { "25": 1, "50": 1, "75": 1, "100": 1 },
  });
  it("puts chips on the module only for a single-module page", () => {
    expect(statsPlacement(stat(["hero"])).moduleId).toBe("hero");
    expect(statsPlacement(stat(["hero"])).perPage).toBe(false);
  });
  it("keeps multi-module numbers in the strip, flagged per page", () => {
    const p = statsPlacement(stat(["hero", "now"]));
    expect(p.moduleId).toBeNull();
    expect(p.perPage).toBe(true);
    expect(p.strip).not.toBeNull();
  });
  it("has nothing without a stat", () => {
    expect(statsPlacement(undefined).strip).toBeNull();
  });
});

describe("visitsSummary", () => {
  it("sums buckets, orders them, and computes change", () => {
    const a = {
      visits: { total: 6, previous: 4, source: "script" },
      chart: {
        visitLength: [
          { bucket: "2026-01-02", key: "x", count: 1 },
          { bucket: "2026-01-01", key: "x", count: 2 },
          { bucket: "2026-01-01", key: "y", count: 3 },
        ],
      },
    } as unknown as AnalyticsResponse;
    const s = visitsSummary(a);
    expect(s.series).toEqual([5, 1]);
    expect(s.total).toBe(6);
    expect(s.pct).toBe(50);
  });
});
