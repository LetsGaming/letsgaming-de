import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { MODULE_KINDS } from "@lg/core";
import { createAutosave } from "../../src/composables/useAutosave";
import { PANEL_FOR_KIND, useLayoutEditor } from "../../src/composables/useLayoutEditor";
import { PANEL } from "../../src/components/cms/panels/panelMap";

function editor(preview: () => Promise<unknown> = async () => null, tabName = "dashboard") {
  const previewArea = ref("home");
  const e = useLayoutEditor({
    locale: ref("en"),
    authed: { value: true },
    tab: ref(tabName),
    previewArea,
    flash: vi.fn(),
    guarded: async (fn) => void (await fn()),
    pickL: () => "",
    loadAll: async () => {},
    autosave: createAutosave({ put: async () => ({ ok: true }), onStatus: () => {} }),
    cms: { preview } as never,
  });
  e.layoutAreas.value = [
    { id: "home", label: { en: "Home" }, description: { en: "" }, modules: ["hero", "glance"] },
    { id: "about", label: { en: "About" }, description: { en: "" }, modules: ["bio"] },
  ];
  return { e, previewArea };
}

describe("canvas selection", () => {
  it("is cleared when the selected module is not on the newly shown page", async () => {
    const { e, previewArea } = editor();
    e.canvasSelected.value = "glance";
    previewArea.value = "about";
    await nextTick();
    expect(e.canvasSelected.value).toBeUndefined();
  });

  it("is kept when the module is on the newly shown page", async () => {
    const { e, previewArea } = editor();
    e.canvasSelected.value = "bio";
    previewArea.value = "about";
    await nextTick();
    expect(e.canvasSelected.value).toBe("bio");
  });

  it("is cleared when the selected module is moved off the current page", async () => {
    const { e } = editor();
    e.canvasSelected.value = "glance";
    e.layoutAreas.value[0]!.modules = ["hero"];
    await nextTick();
    expect(e.canvasSelected.value).toBeUndefined();
  });
});

describe("panel map", () => {
  it("covers every kind", () => {
    expect(Object.keys(PANEL_FOR_KIND).sort()).toEqual([...MODULE_KINDS].sort());
  });

  it("has a panel component for every panel a kind points at", () => {
    for (const panel of Object.values(PANEL_FOR_KIND)) {
      if (panel) expect(PANEL, `no PANEL entry for "${panel}"`).toHaveProperty(panel);
    }
  });

  it("opens each widget's own panel", () => {
    expect(PANEL_FOR_KIND.wrapped).toBe("wrapped");
    expect(PANEL_FOR_KIND.music).toBe("music");
    expect(PANEL_FOR_KIND.playtime).toBe("playtime");
  });
});

describe("canvas refresh after a save", () => {
  it("coalesces a burst of saves into one render and ignores other tabs", async () => {
    vi.useFakeTimers();
    try {
      const preview = vi.fn(async () => null);
      const { e } = editor(preview, "editor");
      e.scheduleCanvasRefresh();
      e.scheduleCanvasRefresh();
      e.scheduleCanvasRefresh();
      expect(preview).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300);
      expect(preview).toHaveBeenCalledTimes(1);

      const other = vi.fn(async () => null);
      editor(other, "dashboard").e.scheduleCanvasRefresh();
      await vi.advanceTimersByTimeAsync(300);
      expect(other).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders again when a refresh is requested while one is in flight", async () => {
    let release: () => void = () => {};
    const preview = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(() => new Promise((r) => (release = () => r("old"))))
      .mockResolvedValue("new");
    const { e } = editor(preview, "editor");
    const first = e.refreshCanvas();
    const second = e.refreshCanvas();
    release();
    await Promise.all([first, second]);
    expect(preview).toHaveBeenCalledTimes(2);
    expect(e.canvasSite.value).toBe("new");
    expect(e.canvasLoading.value).toBe(false);
  });
});

describe("module heading", () => {
  it("falls back to the friendly kind name, not the raw id, when the heading is empty", () => {
    const { e } = editor();
    e.modules.value = [{ id: "glance", kind: "glance", heading: { en: "" } }] as never;
    expect(e.moduleHeading("glance")).toBe("At a glance");
    expect(e.moduleHeading("unknown-id")).toBe("unknown-id");
  });
});
