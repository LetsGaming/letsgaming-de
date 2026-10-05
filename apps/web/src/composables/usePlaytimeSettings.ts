import { defaultPlaytimeSettings, LIST_DISPLAY_BOUNDS } from "@lg/core";
import { type ListSettingsDeps, useListSettings } from "./useListSettings";

/**
 * The Playtime list-display slice of the CMS, kept separate from Listening so the two
 * modules' limits can differ. Bounds come from the shared `LIST_DISPLAY_BOUNDS`.
 */
export type PlaytimeDeps = ListSettingsDeps;

export function usePlaytimeSettings(deps: PlaytimeDeps) {
  const s = useListSettings(deps, "playtime", defaultPlaytimeSettings);
  return {
    PLAYTIME_LIST_BOUNDS: LIST_DISPLAY_BOUNDS,
    playtimeInitialCount: s.initialCount,
    playtimeMaxCount: s.maxCount,
    playtimeDefaultRange: s.defaultRange,
    savePlaytime: s.save,
    hydratePlaytime: s.hydrate,
  };
}
