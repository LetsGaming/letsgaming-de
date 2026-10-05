import { MODULE_KINDS } from "@lg/core";
import { describe, expect, it } from "vitest";
import { PANEL_FOR_KIND } from "../../src/composables/useLayoutEditor";
import {
  SYNCED_INFO,
  addTag,
  formatDate,
  nextWrappedWindow,
  removeTag,
  suggestTags,
} from "../../src/lib/cmsInspector";

describe("module inspectors", () => {
  it("gives every module kind a panel or a synced inspector", () => {
    for (const kind of MODULE_KINDS) {
      expect(PANEL_FOR_KIND[kind] !== null || SYNCED_INFO[kind] !== undefined, kind).toBe(true);
    }
  });

  it("maps derived kinds to their data source", () => {
    expect(SYNCED_INFO.coding?.source).toBe("wakapi");
    expect(SYNCED_INFO.activity?.source).toBe("github");
    expect(SYNCED_INFO.projects?.source).toBe("github");
    expect(SYNCED_INFO.teasers?.source).toBeNull();
  });
});

describe("tag list", () => {
  it("adds trimmed names and ignores blanks and case-insensitive duplicates", () => {
    expect(addTag(["R6"], "  Minecraft ")).toEqual(["R6", "Minecraft"]);
    expect(addTag(["R6"], "r6")).toEqual(["R6"]);
    expect(addTag(["R6"], "   ")).toEqual(["R6"]);
  });

  it("removes a name", () => {
    expect(removeTag(["a", "b"], "a")).toEqual(["b"]);
  });

  it("suggests unchosen matches in the given order", () => {
    const names = [{ name: "Minecraft" }, { name: "R6" }, { name: "Minesweeper" }];
    expect(suggestTags(names, ["r6"], "")).toEqual(["Minecraft", "Minesweeper"]);
    expect(suggestTags(names, [], "mine")).toEqual(["Minecraft", "Minesweeper"]);
    expect(suggestTags(names, [], "", 1)).toEqual(["Minecraft"]);
  });
});

describe("dates", () => {
  it("formats a calendar date in the given locale without shifting the day", () => {
    expect(formatDate("2026-08-01", "de-DE")).toBe("1.8.2026");
    expect(formatDate("2026-08-01", "en-US")).toBe("8/1/2026");
  });

  it("finds the next Wrapped window, or the open one", () => {
    const s = { enabled: true, everyMonths: 3, forWeeks: 2, fromDate: "2026-01-01", topCount: 5 };
    expect(nextWrappedWindow(s, new Date("2026-02-01T00:00:00Z"))).toEqual({
      kind: "next",
      start: "2026-04-01T00:00:00.000Z",
    });
    expect(nextWrappedWindow(s, new Date("2026-04-05T00:00:00Z"))).toMatchObject({ kind: "open" });
    expect(nextWrappedWindow({ ...s, enabled: false }, new Date())).toBeNull();
  });
});
