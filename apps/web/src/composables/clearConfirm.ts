import type { ClearRangeId } from "@lg/core";

/** The word that has to be typed before the unbounded delete is allowed. */
export const CLEAR_ALL_WORD = "delete";

/** Only the unbounded range needs the typed word; windowed clears need one click of confirmation. */
export function needsTypedWord(range: ClearRangeId): boolean {
  return range === "all";
}

export function isClearConfirmed(range: ClearRangeId, typed: string): boolean {
  if (!needsTypedWord(range)) return true;
  return typed.trim().toLowerCase() === CLEAR_ALL_WORD;
}
