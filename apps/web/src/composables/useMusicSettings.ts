import { ref } from "vue";
import { defaultMusicSettings, MUSIC_LIST_BOUNDS } from "@lg/core";

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

  const saveMusic = () =>
    guarded(() =>
      cms.put("music", {
        initialCount: musicInitialCount.value,
        maxCount: musicMaxCount.value,
      }),
    );

  /** Load both counts from the site content the CMS fetched. */
  function hydrate(m: { initialCount?: number; maxCount?: number } | undefined) {
    const def = defaultMusicSettings();
    musicInitialCount.value = m?.initialCount ?? def.initialCount;
    musicMaxCount.value = m?.maxCount ?? def.maxCount;
  }

  return {
    MUSIC_LIST_BOUNDS,
    musicInitialCount,
    musicMaxCount,
    saveMusic,
    hydrateMusic: hydrate,
  };
}
