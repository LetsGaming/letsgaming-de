import { describe, expect, it } from "vitest";
import { ref } from "vue";
import {
  filterPalette,
  isTypingTarget,
  missingTranslation,
  shortcutFor,
} from "../../src/composables/editorHelpers";
import { createAutosave } from "../../src/composables/useAutosave";
import { useLayoutEditor } from "../../src/composables/useLayoutEditor";

function editor() {
  const e = useLayoutEditor({
    locale: ref("en"),
    authed: { value: true },
    tab: ref("dashboard"),
    previewArea: ref("home"),
    flash: () => {},
    guarded: async (fn) => void (await fn()),
    pickL: (l) => l?.en ?? "",
    loadAll: async () => {},
    autosave: createAutosave({ put: async () => ({ ok: true }), onStatus: () => {} }),
    cms: {} as never,
  });
  e.hydrateLayout({
    modules: ["hero", "glance", "now", "gallery"].map((id) => ({ id, kind: id as never })),
    nav: [
      { id: "home", label: { en: "Home" }, modules: ["hero", "glance"] },
      { id: "life", label: { en: "Life" }, modules: ["now"] },
    ] as never,
  });
  return e;
}

describe("tree moves", () => {
  it("hydrates unplaced modules into hidden", () => {
    expect(editor().hiddenModules.value).toEqual(["gallery"]);
  });

  it("moves a module between pages at a position", () => {
    const e = editor();
    e.moveModuleTo("home", 1, "life", 0);
    expect(e.layoutAreas.value.map((a) => a.modules)).toEqual([["hero"], ["glance", "now"]]);
  });

  it("nudges within a page and stops at the ends", () => {
    const e = editor();
    e.nudgeModule("hero", 1);
    expect(e.layoutAreas.value[0]!.modules).toEqual(["glance", "hero"]);
    e.nudgeModule("hero", 1);
    expect(e.layoutAreas.value[0]!.modules).toEqual(["glance", "hero"]);
    e.nudgeModule("gallery", -1);
    expect(e.hiddenModules.value).toEqual(["gallery"]);
  });

  it("hides a module and lets setModuleArea bring it back", () => {
    const e = editor();
    e.hideModule("hero");
    expect(e.hiddenModules.value).toContain("hero");
    e.setModuleArea("hero", "life");
    expect(e.layoutAreas.value[1]!.modules).toEqual(["now", "hero"]);
  });
});

describe("missingTranslation", () => {
  it("is never missing in English", () => {
    expect(missingTranslation({ heading: { en: "Hi" } }, "en")).toBe(false);
  });
  it("flags a heading or note lacking the locale", () => {
    expect(missingTranslation({ heading: { en: "Hi" } }, "de")).toBe(true);
    expect(missingTranslation({ heading: { en: "Hi", de: "Hallo" }, note: { en: "n" } }, "de")).toBe(true);
  });
  it("ignores translated, empty and absent text", () => {
    expect(missingTranslation({ heading: { en: "Hi", de: "Hallo" } }, "de")).toBe(false);
    expect(missingTranslation({ heading: { en: "" } }, "de")).toBe(false);
    expect(missingTranslation({}, "de")).toBe(false);
  });
});

describe("shortcutFor", () => {
  const key = (k: string, o: Partial<KeyboardEvent> = {}, target: EventTarget | null = document.body) =>
    shortcutFor({ key: k, ctrlKey: false, metaKey: false, altKey: false, target, ...o });

  it("maps the editor shortcuts", () => {
    expect(key("ArrowUp", { altKey: true })).toBe("move-up");
    expect(key("ArrowDown", { altKey: true })).toBe("move-down");
    expect(key("Delete")).toBe("remove");
    expect(key("?")).toBe("help");
    expect(key("k", { ctrlKey: true })).toBe("palette");
  });

  it("stays quiet while typing, except Ctrl+K", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    expect(isTypingTarget(input)).toBe(true);
    expect(key("Delete", {}, input)).toBeNull();
    expect(key("?", {}, area)).toBeNull();
    expect(key("ArrowUp", { altKey: true }, input)).toBeNull();
    expect(key("k", { ctrlKey: true }, input)).toBe("palette");
  });
});

describe("filterPalette", () => {
  const items = [{ label: "Home" }, { label: "Guestbook (guestbook)" }, { label: "Save layout" }];
  it("keeps everything for an empty query", () => {
    expect(filterPalette(items, "  ")).toHaveLength(3);
  });
  it("requires every term, case-insensitively", () => {
    expect(filterPalette(items, "GUEST book")).toEqual([items[1]]);
    expect(filterPalette(items, "save home")).toEqual([]);
  });
});
