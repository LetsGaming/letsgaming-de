import { defaultMusicSettings, MUSIC_LIST_BOUNDS } from "@lg/core";
import { type ListSettingsDeps, useListSettings } from "./useListSettings";

/**
 * The Listening list-display slice of the CMS. `useCms` spreads the result into its
 * return so a panel that `inject()`s the context sees these members.
 *
 * The bounds come from `MUSIC_LIST_BOUNDS`, the same constant the write schema
 * validates against and the server sanitizer clamps to.
 */
export type MusicDeps = ListSettingsDeps;

export function useMusicSettings(deps: MusicDeps) {
  const s = useListSettings(deps, "music", "Edit listening settings", defaultMusicSettings);
  return {
    MUSIC_LIST_BOUNDS,
    musicInitialCount: s.initialCount,
    musicMaxCount: s.maxCount,
    musicDefaultRange: s.defaultRange,
    hydrateMusic: s.hydrate,
  };
}
