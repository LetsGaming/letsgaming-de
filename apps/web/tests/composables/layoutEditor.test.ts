import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { MODULE_KINDS } from "@lg/core";
import { PANEL_FOR_KIND, useLayoutEditor } from "../../src/composables/useLayoutEditor";
import { PANEL } from "../../src/components/cms/panels/panelMap";

function editor() {
  const previewArea = ref("home");
  const e = useLayoutEditor({
    locale: ref("en"),
    authed: { value: true },
    tab: ref("dashboard"),
    previewArea,
    flash: vi.fn(),
    guarded: async (fn) => void (await fn()),
    pickL: () => "",
    loadAll: async () => {},
    cms: {} as never,
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
