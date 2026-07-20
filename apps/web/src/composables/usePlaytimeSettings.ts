import { ref } from "vue";
import { defaultPlaytimeSettings, LIST_DISPLAY_BOUNDS } from "@lg/core";

/**
 * The Playtime list-display slice of the CMS — the twin of `useMusicSettings`, kept
 * separate so the two modules' limits can differ (that's the point of a distinct
 * widget). A couple of counts and a save; `useCms` spreads the result into its
 * return so a panel that `inject()`s the context sees these alongside the rest.
 *
 * The bounds come from the shared `LIST_DISPLAY_BOUNDS` — the same constant the write
 * schema validates against and the server sanitizer clamps to — so input, schema, and
 * sanitizer can't disagree. Unlike Listening the cap is applied in the view rather
 * than a query LIMIT, but the edited numbers are identical.
 */
export interface PlaytimeDeps {
  /** Run a mutation with the CMS's error/toast handling. */
  guarded: (fn: () => Promise<unknown>) => Promise<void>;
  /** The CMS API client (its `put` takes a resource + body). */
  cms: { put: (resource: string, body: unknown) => Promise<unknown> };
}

export function usePlaytimeSettings({ guarded, cms }: PlaytimeDeps) {
  const d = defaultPlaytimeSettings();
  // Rows shown before "show more".
  const playtimeInitialCount = ref<number>(d.initialCount);
  // The most rows the top-games list and its day drill-in ever show.
  const playtimeMaxCount = ref<number>(d.maxCount);

  const savePlaytime = () =>
    guarded(() =>
      cms.put("playtime", {
        initialCount: playtimeInitialCount.value,
        maxCount: playtimeMaxCount.value,
      }),
    );

  /** Load both counts from the site content the CMS fetched. */
  function hydrate(p: { initialCount?: number; maxCount?: number } | undefined) {
    const def = defaultPlaytimeSettings();
    playtimeInitialCount.value = p?.initialCount ?? def.initialCount;
    playtimeMaxCount.value = p?.maxCount ?? def.maxCount;
  }

  return {
    PLAYTIME_LIST_BOUNDS: LIST_DISPLAY_BOUNDS,
    playtimeInitialCount,
    playtimeMaxCount,
    savePlaytime,
    hydratePlaytime: hydrate,
  };
}
