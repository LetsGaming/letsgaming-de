import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { cms } from "../../src/lib/cms";
import type { AnalyticsChart, AnalyticsResponse, Localized, SiteContent, SiteView } from "@lg/core";
import { useCms } from "../../src/composables/useCms";

/**
 * `useCms` is a composable, so it needs a component to live in (onMounted,
 * watch). This is the smallest one that will hold it.
 *
 * Every mount is tracked and unmounted afterwards, and that is not tidiness: the
 * composable attaches window/document listeners, so a component left mounted keeps
 * reacting to the *next* test's `location.hash = ""`. The first version of this
 * file leaked them and two tests passed off each other's events.
 */
const mounted: { unmount: () => void }[] = [];

function mountCms() {
  let api!: ReturnType<typeof useCms>;
  const Host = defineComponent({
    setup() {
      api = useCms();
      return () => h("div");
    },
  });
  mounted.push(mount(Host));
  return { api: () => api };
}

/**
 * Point the URL at a panel *before* anything is listening.
 *
 * Assigning `location.hash` queues a `hashchange`. Set it and mount immediately
 * and that event lands after `onMounted` has attached the listener — so the panel
 * opens via `onHashChange`, the mount-time restore is never exercised, and a test
 * for "reload lands where you were" passes with the restore deleted. It did. This
 * drains the event against a page with no listeners, so what the test measures is
 * the reload path and only that.
 */
async function withHash(value: string) {
  window.location.hash = value;
  await new Promise((r) => setTimeout(r, 0));
}

/** boot() calls cms.me(); reject it so every test lands on the gate, no network. */
beforeEach(async () => {
  vi.spyOn(cms, "me").mockRejectedValue(new Error("unauthenticated"));
  await withHash("");
});
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("which panel is open", () => {
  it("opens the dashboard when the URL says nothing", async () => {
    const { api } = mountCms();
    await flushPromises();
    expect(api().tab.value).toBe("dashboard");
  });

  it("restores the panel named by the URL on load — the reload complaint", async () => {
    await withHash("#layout");
    const { api } = mountCms();
    await flushPromises();
    expect(api().tab.value).toBe("layout");
  });

  it("falls back rather than rendering nothing for a stale or hostile hash", async () => {
    await withHash("#does-not-exist");
    const { api } = mountCms();
    await flushPromises();
    expect(api().tab.value).toBe("dashboard");
  });

  it("writes the panel to the URL, so a reload comes back to it", async () => {
    const { api } = mountCms();
    await flushPromises();
    api().pick("hobbies");
    expect(window.location.hash).toBe("#hobbies");
  });

  it("follows back/forward", async () => {
    const { api } = mountCms();
    await flushPromises();
    api().pick("links");
    expect(api().tab.value).toBe("links");

    // What the browser does on Back: change the hash, fire the event.
    window.location.hash = "#now";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await flushPromises();
    expect(api().tab.value).toBe("now");
  });
});


// ── fixtures ─────────────────────────────────────────────────────────────────
//
// These used to be `{}`. That typechecked because `cms.*` returned `any`, which
// meant every test here proved the composable works against a server returning
// literally anything — including nothing. Now the client declares the shapes from
// @lg/core, so a mock has to be a response the server could actually send. That's
// the point of the exercise: the fixtures were the third place the API shape was
// being asserted without being checked.

const emptyChart = (): AnalyticsChart => ({
  unit: "hour",
  pageviews: [],
  sections: [],
  clicks: [],
  visitLength: [],
  bots: [],
});

const emptyAnalytics = (): AnalyticsResponse => ({
  range: { from: "2026-07-17T00", to: "2026-07-17T12", hours: 12, unit: "hour" },
  paths: [],
  referrers: [],
  browsers: [],
  os: [],
  devices: [],
  bots: [],
  chart: emptyChart(),
  engagement: {
    tabs: [], exits: [], transitions: [], dwell: [], scroll: [],
    sessionTabs: [], sessionDwell: [], clicks: [], projects: [],
    viewport: [], theme: [],
  },
});

const L = (en: string): Localized => ({ en });

/** A SiteView the canvas could actually render. `{}` used to satisfy this. */
const emptySiteView = (): SiteView => ({
  locale: "en",
  meta: { name: "Domenic", handle: "@LetsGaming", location: "DE", role: "dev" },
  nav: [],
  modules: {},
});

const emptyContent = (): SiteContent => ({
  // Authored meta: location/role are Localized. The *view's* meta is the resolved
  // one, with plain strings — two shapes an `any` mock happily conflated.
  meta: { name: "Domenic", handle: "@LetsGaming", location: L("DE"), role: L("dev") },
  headline: { before: L("a"), highlight: L("b"), after: L("c") },
  lede: L("lede"),
  status: { verb: L("building"), now: L("things") },
  bio: [],
  projects: [],
  hobbies: [],
  links: [],
  now: [],
});

describe("analytics refresh", () => {
  it("polls while the panel is open, and stops when you leave it", async () => {
    vi.useFakeTimers();
    const load = vi.spyOn(cms, "analytics").mockResolvedValue(emptyAnalytics());
    const { api } = mountCms();

    api().pick("analytics");
    await flushPromises();
    const afterOpen = load.mock.calls.length;
    expect(afterOpen).toBeGreaterThan(0); // opening it loads once

    await vi.advanceTimersByTimeAsync(31_000);
    expect(load.mock.calls.length).toBeGreaterThan(afterOpen); // and again on its own

    api().pick("dashboard");
    const afterLeave = load.mock.calls.length;
    await vi.advanceTimersByTimeAsync(90_000);
    expect(load.mock.calls.length).toBe(afterLeave); // a closed panel asks for nothing
  });

  it("does not poll a backgrounded tab", async () => {
    vi.useFakeTimers();
    const load = vi.spyOn(cms, "analytics").mockResolvedValue(emptyAnalytics());
    const { api } = mountCms();
    api().pick("analytics");
    await flushPromises();

    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    const hiddenAt = load.mock.calls.length;

    await vi.advanceTimersByTimeAsync(90_000);
    expect(load.mock.calls.length).toBe(hiddenAt);
  });

  it("stops polling instead of hammering a 401 forever", async () => {
    vi.useFakeTimers();
    const { AuthError } = await import("../../src/lib/cms");
    const load = vi.spyOn(cms, "analytics").mockRejectedValue(new AuthError());
    const { api } = mountCms();

    api().pick("analytics");
    await flushPromises();
    const afterFail = load.mock.calls.length;

    await vi.advanceTimersByTimeAsync(120_000);
    expect(load.mock.calls.length).toBe(afterFail);
  });

  it("a read never invalidates the preview — that's a save's job", async () => {
    vi.spyOn(cms, "analytics").mockResolvedValue(emptyAnalytics());
    const { api } = mountCms();
    await flushPromises();
    const before = api().previewKey.value;

    api().pick("analytics");
    await flushPromises();
    await api().refreshAnalytics();
    await flushPromises();

    // Polling through guarded() would have reloaded the preview iframe every 30s.
    expect(api().previewKey.value).toBe(before);
  });
});

/**
 * Seed the layout + gallery state the way boot() would, so the reorder tests
 * exercise the real handlers rather than a fixture of their own.
 */
function seedContent() {
  vi.spyOn(cms, "me").mockResolvedValue({ login: "LetsGaming" });
  vi.spyOn(cms, "content").mockResolvedValue({
    content: {
      ...emptyContent(),
      gallery: [
        { id: "img1", module: "gallery", asset: "asset:a", caption: L("a") },
        { id: "img2", module: "gallery", asset: "asset:b", caption: L("b") },
        { id: "img3", module: "gallery", asset: "asset:c", caption: L("c") },
        { id: "img4", module: "gallery", asset: "asset:d", caption: L("d") },
      ],
    },
    modules: [
      { id: "hero", kind: "hero" },
      { id: "projects", kind: "projects" },
      { id: "activity", kind: "activity" },
      { id: "gallery", kind: "gallery" },
      { id: "guestbook", kind: "guestbook" },
    ],
    nav: [
      { id: "home", label: { en: "Home" }, modules: ["hero", "projects"] },
      { id: "code", label: { en: "Code" }, modules: ["activity"] },
    ],
  });
}

const areaIds = (api: ReturnType<typeof useCms>, id: string) =>
  api.layoutAreas.value.find((a) => a.id === id)?.modules;

describe("layout: one move, three ways to ask for it", () => {
  beforeEach(seedContent);

  it("seeds areas and puts unplaced modules in Hidden", async () => {
    const { api } = mountCms();
    await flushPromises();
    expect(areaIds(api(), "home")).toEqual(["hero", "projects"]);
    expect(areaIds(api(), "code")).toEqual(["activity"]);
    expect(api().hiddenModules.value).toEqual(["gallery", "guestbook"]);
  });

  it("drags a module across areas, landing where it was dropped", async () => {
    const { api } = mountCms();
    await flushPromises();
    // "activity" from code[0] into home at index 1 — between hero and projects.
    api().dropModule({ from: "code", to: "home", oldIndex: 0, newIndex: 1 });
    expect(areaIds(api(), "home")).toEqual(["hero", "activity", "projects"]);
    expect(areaIds(api(), "code")).toEqual([]);
  });

  it("drags within an area, over a distance ↑/↓ can't express", async () => {
    const { api } = mountCms();
    await flushPromises();
    api().dropModule({ from: "hidden", to: "home", oldIndex: 0, newIndex: 0 });
    expect(areaIds(api(), "home")).toEqual(["gallery", "hero", "projects"]);

    // last → first, in one go. A swap would have moved it one step.
    api().dropModule({ from: "home", to: "home", oldIndex: 2, newIndex: 0 });
    expect(areaIds(api(), "home")).toEqual(["projects", "gallery", "hero"]);
  });

  it("drags into Hidden — that's what taking it off the site is", async () => {
    const { api } = mountCms();
    await flushPromises();
    api().dropModule({ from: "home", to: "hidden", oldIndex: 0, newIndex: 0 });
    expect(areaIds(api(), "home")).toEqual(["projects"]);
    expect(api().hiddenModules.value).toEqual(["hero", "gallery", "guestbook"]);
  });

  it("↑/↓ still does exactly what it did — same list, one step", async () => {
    const { api } = mountCms();
    await flushPromises();
    api().moveModule(0, 1, -1);
    expect(areaIds(api(), "home")).toEqual(["projects", "hero"]);
    api().moveModule(0, 0, 1);
    expect(areaIds(api(), "home")).toEqual(["hero", "projects"]);
  });

  it("↑/↓ refuses to run off either end", async () => {
    const { api } = mountCms();
    await flushPromises();
    api().moveModule(0, 0, -1);
    api().moveModule(0, 1, 1);
    expect(areaIds(api(), "home")).toEqual(["hero", "projects"]);
  });

  it("the dropdown still appends, because a <select> names an area not a slot", async () => {
    const { api } = mountCms();
    await flushPromises();
    api().setModuleArea("activity", "home");
    expect(areaIds(api(), "home")).toEqual(["hero", "projects", "activity"]);
    expect(areaIds(api(), "code")).toEqual([]);
  });
});

describe("gallery reorder", () => {
  beforeEach(seedContent);

  it("sends the whole order in one request, not a PUT per image", async () => {
    const reorder = vi.spyOn(cms, "reorderGallery").mockResolvedValue({ ok: true });
    const put = vi.spyOn(cms, "put").mockResolvedValue({ ok: true });
    const { api } = mountCms();
    await flushPromises();

    api().dropGallery({ from: "gallery", to: "gallery", oldIndex: 3, newIndex: 0 });
    await flushPromises();

    expect(reorder).toHaveBeenCalledTimes(1);
    expect(reorder).toHaveBeenCalledWith("gallery", ["img4", "img1", "img2", "img3"]);
    expect(put).not.toHaveBeenCalled();
  });

  it("renumbers sort to the position, so it can't drift from the list", async () => {
    vi.spyOn(cms, "reorderGallery").mockResolvedValue({ ok: true });
    const { api } = mountCms();
    await flushPromises();

    api().dropGallery({ from: "gallery", to: "gallery", oldIndex: 0, newIndex: 2 });
    await flushPromises();

    expect(api().activeGalleryItems.value.map((g) => g.id)).toEqual([
      "img2", "img3", "img1", "img4",
    ]);
    expect(api().activeGalleryItems.value.map((g) => g.sort)).toEqual([0, 1, 2, 3]);
  });

  it("↑/↓ goes through the same path", async () => {
    const reorder = vi.spyOn(cms, "reorderGallery").mockResolvedValue({ ok: true });
    const { api } = mountCms();
    await flushPromises();

    api().moveGallery(0, 1);
    await flushPromises();
    expect(reorder).toHaveBeenCalledWith("gallery", ["img2", "img1", "img3", "img4"]);
  });
});

describe("editor canvas", () => {
  beforeEach(seedContent);

  it("resolves the pending order server-side without saving it", async () => {
    const preview = vi.spyOn(cms, "preview").mockResolvedValue(emptySiteView());
    const put = vi.spyOn(cms, "put").mockResolvedValue({ ok: true });
    const { api } = mountCms();
    await flushPromises();

    api().dropModule({ from: "code", to: "home", oldIndex: 0, newIndex: 0 });
    await api().refreshCanvas();

    // The order it sends is the pending one — what you dragged, not what's saved.
    expect(preview).toHaveBeenCalledWith(
      [
        { area: "home", modules: ["activity", "hero", "projects"] },
        { area: "code", modules: [] },
      ],
      "en",
    );
    // And nothing was written. The canvas is a mirror; Save layout is the gate.
    expect(put).not.toHaveBeenCalled();
  });

  it("a canvas drag goes through the same primitive as everything else", async () => {
    vi.spyOn(cms, "preview").mockResolvedValue(emptySiteView());
    const { api } = mountCms();
    await flushPromises();

    api().canvasMove("home", 0, 1);
    expect(areaIds(api(), "home")).toEqual(["projects", "hero"]);
  });

  it("clicking a module opens the panel that edits it", async () => {
    vi.spyOn(cms, "preview").mockResolvedValue(emptySiteView());
    const { api } = mountCms();
    await flushPromises();

    api().canvasSelect("gallery");
    expect(api().tab.value).toBe("gallery");
  });

  it("says so instead of opening an empty panel for a synced module", async () => {
    vi.spyOn(cms, "preview").mockResolvedValue(emptySiteView());
    const { api } = mountCms();
    await flushPromises();
    api().pick("dashboard");

    api().canvasSelect("activity"); // rendered from synced data — nothing to edit
    expect(api().tab.value).toBe("dashboard");
    expect(api().toast.value).toContain("synced data");
  });

  it("the inserter offers what's unplaced, and drops it where you asked", async () => {
    vi.spyOn(cms, "preview").mockResolvedValue(emptySiteView());
    const { api } = mountCms();
    await flushPromises();

    api().canvasInsert("home", 1);
    expect(api().insertAt.value).toEqual({ area: "home", index: 1 });

    api().insertModule("guestbook");
    expect(areaIds(api(), "home")).toEqual(["hero", "guestbook", "projects"]);
    expect(api().hiddenModules.value).toEqual(["gallery"]);
    expect(api().insertAt.value).toBeNull();
  });
});

describe("the canvas is a component now", () => {
  beforeEach(seedContent);

  /**
   * What used to be here: a `structuredClone` regression for `DataCloneError`, and
   * a `canvas:ready` handshake test. Both were tests *of the boundary*, not of the
   * editor — postMessage can't clone a Vue proxy, and a parent can't know when a
   * `client:only` island inside an iframe has mounted. Neither failure exists once
   * the canvas is a component holding a prop, so the tests go with the boundary
   * rather than outliving it as decoration.
   */
  it("hands the canvas the pending view, and nothing serializes", async () => {
    vi.spyOn(cms, "preview").mockResolvedValue(emptySiteView());
    const { api } = mountCms();
    await flushPromises();

    await api().refreshCanvas();
    // A prop. Not a message, not a clone — the same object the fetch returned.
    expect(api().canvasSite.value).not.toBeNull();
    expect(api().canvasSite.value?.locale).toBe("en");
  });

  it("opens and closes as a mode", async () => {
    vi.spyOn(cms, "preview").mockResolvedValue(emptySiteView());
    const { api } = mountCms();
    await flushPromises();

    expect(api().editorOpen.value).toBe(false);
    api().editorOpen.value = true;
    expect(api().editorOpen.value).toBe(true);
  });
});
