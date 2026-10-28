import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackEvent } from "@lg/core";

vi.mock("../../src/lib/api", () => ({
  apiBase: "http://api.test",
  apiUrl: (p: string) => `http://api.test${p}`,
}));

type Entry = {
  target: Element;
  isIntersecting: boolean;
  intersectionRatio: number;
  intersectionRect: { height: number };
  rootBounds: null;
};

let sent: TrackEvent[][] = [];
let pending: Promise<void>[] = [];
let observerCb: ((entries: Entry[]) => void) | undefined;
let visibility = "visible";

class FakeObserver {
  constructor(cb: (entries: Entry[]) => void) {
    observerCb = cb;
  }
  observe() {}
  disconnect() {}
}

async function load() {
  vi.resetModules();
  return import("../../src/lib/track");
}

const batches = async () => {
  await Promise.all(pending);
  return sent;
};
const dims = async () => (await batches()).flat().map((e) => e.d);

function show(id: string, ratio = 0.8) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no #${id}`);
  observerCb?.([
    {
      target: el,
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
      intersectionRect: { height: 0 },
      rootBounds: null,
    },
  ]);
}

function setVisibility(v: string) {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  pending = [];
  observerCb = undefined;
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: (_url: string, blob: Blob) => {
      pending.push(
        blob.text().then((t) => void sent.push((JSON.parse(t) as { events: TrackEvent[] }).events)),
      );
      return true;
    },
  });
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  document.body.innerHTML = `
    <section class="module-section" id="hero"></section>
    <section class="module-section" id="now"></section>`;
});

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("visit confirmation", () => {
  it("a bare load sends tab, viewport and theme but no visit", async () => {
    const { initTracking } = await load();
    initTracking("home", "dark");
    vi.advanceTimersByTime(4_000);
    const d = await dims();
    expect(d).toEqual(expect.arrayContaining(["tab", "viewport", "theme"]));
    expect(d).not.toContain("visit");
  });

  it("sends visit once, at the first trigger", async () => {
    const { initTracking, trackClick } = await load();
    initTracking("home", "dark");
    trackClick("nav");
    trackClick("nav");
    show("hero");
    vi.advanceTimersByTime(10_000);
    const visits = (await batches()).flat().filter((e) => e.d === "visit");
    expect(visits).toEqual([{ d: "visit", k: "click" }]);
  });

  it("confirms on the first module seen", async () => {
    const { initTracking } = await load();
    initTracking("home", "dark");
    show("hero");
    const events = (await batches()).flat();
    expect(events).toContainEqual({ d: "visit", k: "section" });
    expect(events).toContainEqual({ d: "module", k: "hero" });
    expect(events).toContainEqual({ d: "module_entry", k: "hero" });
  });

  it("counts dwell only while the tab is visible", async () => {
    const { initTracking } = await load();
    initTracking("home", "dark");
    vi.advanceTimersByTime(3_000);
    setVisibility("hidden");
    vi.advanceTimersByTime(60_000);
    setVisibility("visible");
    vi.advanceTimersByTime(1_900);
    expect(await dims()).not.toContain("visit");
    vi.advanceTimersByTime(300);
    expect((await batches()).flat()).toContainEqual({ d: "visit", k: "dwell" });
  });
});

describe("modules", () => {
  it("emits dwell and flow when focus moves", async () => {
    const { initTracking } = await load();
    initTracking("home", "dark");
    show("hero");
    vi.advanceTimersByTime(6_000);
    show("hero", 0);
    show("now");
    setVisibility("hidden");
    const events = (await batches()).flat();
    expect(events).toContainEqual({ d: "module_dwell", k: "hero|5-15s" });
    expect(events).toContainEqual({ d: "module_flow", k: "hero>now" });
  });
});

describe("pagehide", () => {
  it("keeps the closing events at the front of a long queue", async () => {
    const { initTracking, trackClick } = await load();
    initTracking("home", "dark");
    show("hero");
    sent = [];
    for (let i = 0; i < 100; i++) trackClick("nav");
    window.dispatchEvent(new Event("pagehide"));
    const last = (await batches()).at(-1) ?? [];
    expect(last.length).toBeGreaterThan(80);
    const head = last.slice(0, 80).map((e) => e.d);
    expect(head).toEqual(
      expect.arrayContaining([
        "session_tabs",
        "session_dwell",
        "session_modules",
        "exit",
        "module_exit",
        "dwell",
      ]),
    );
  });
});
