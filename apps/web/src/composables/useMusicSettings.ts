import { ref } from "vue";
import {
  defaultMusicSettings,
  MUSIC_LIST_BOUNDS,
  type ActivityRange,
} from "@lg/core";

/**
 * The Listening list-display slice of the CMS.
 *
 * Same shape as `usePresenceSettings`: a couple of pieces of state and a save,
 * needing only the shared write helpers passed in. `useCms` calls this and spreads
 * the result into its return, so a panel that `inject()`s the context sees these
 * members alongside the rest.
 *
 * Both counts are just numbers here; the *bounds* come from `MUSIC_LIST_BOUNDS`,
 * the same constant the write schema validates against and the server sanitizer
 * clamps to — so the input, the schema, and the sanitizer can't disagree. The cap
 * itself is enforced server-side (a query LIMIT); this only edits the number.
 */
export interface MusicDeps {
  /** Run a mutation with the CMS's error/toast handling. */
  guarded: (fn: () => Promise<unknown>) => Promise<void>;
  /** The CMS API client (its `put` takes a resource + body). */
  cms: { put: (resource: string, body: unknown) => Promise<unknown> };
}

export function useMusicSettings({ guarded, cms }: MusicDeps) {
  const d = defaultMusicSettings();
  // Rows shown before "show more".
  const musicInitialCount = ref<number>(d.initialCount);
  // The most rows the list ever shows — applied as the query LIMIT server-side.
  const musicMaxCount = ref<number>(d.maxCount);

  /**
   * The window the module opens in. A viewer can pick another on the card; this is
   * only what it shows before they do — so changing it moves the landing view, not
   * what anyone is allowed to look at.
   */
  const musicDefaultRange = ref<ActivityRange>(d.defaultRange);

  const saveMusic = () =>
    guarded(() =>
      cms.put("music", {
        initialCount: musicInitialCount.value,
        maxCount: musicMaxCount.value,
        defaultRange: musicDefaultRange.value,
      }),
    );

  /** Load both counts from the site content the CMS fetched. */
  function hydrate(m: { initialCount?: number; maxCount?: number; defaultRange?: ActivityRange } | undefined) {
    const def = defaultMusicSettings();
    musicInitialCount.value = m?.initialCount ?? def.initialCount;
    musicMaxCount.value = m?.maxCount ?? def.maxCount;
    musicDefaultRange.value = m?.defaultRange ?? def.defaultRange;
  }

  return {
    MUSIC_LIST_BOUNDS,
    musicInitialCount,
    musicMaxCount,
    musicDefaultRange,
    saveMusic,
    hydrateMusic: hydrate,
  };
}
