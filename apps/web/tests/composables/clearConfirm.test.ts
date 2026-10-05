import { describe, expect, it } from "vitest";
import { CLEAR_ALL_WORD, isClearConfirmed, needsTypedWord } from "../../src/composables/clearConfirm";

describe("clear confirmation", () => {
  it("only the unbounded range requires the typed word", () => {
    expect(needsTypedWord("all")).toBe(true);
    for (const id of ["hour", "24h", "3d", "7d"] as const) expect(needsTypedWord(id)).toBe(false);
  });

  it("windowed ranges are confirmed without typing", () => {
    expect(isClearConfirmed("24h", "")).toBe(true);
  });

  it("everything stays locked until the word matches", () => {
    expect(isClearConfirmed("all", "")).toBe(false);
    expect(isClearConfirmed("all", "dele")).toBe(false);
    expect(isClearConfirmed("all", CLEAR_ALL_WORD)).toBe(true);
    expect(isClearConfirmed("all", `  ${CLEAR_ALL_WORD.toUpperCase()} `)).toBe(true);
  });
});
