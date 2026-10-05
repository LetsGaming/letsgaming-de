import { ref } from "vue";
import type { ActivityRange } from "@lg/core";

/** Write helpers a settings slice needs from the parent CMS. */
export interface ListSettingsDeps {
  /** Run a mutation with the CMS's error/toast handling. */
  guarded: (fn: () => Promise<unknown>) => Promise<void>;
  cms: { put: (resource: string, body: unknown) => Promise<unknown> };
}

interface ListValues {
  initialCount: number;
  maxCount: number;
  defaultRange: ActivityRange;
}

/**
 * The state and save of a ranked-list module's display settings (rows shown, row cap,
 * opening window). Listening and Played are the same form over different resources;
 * their composables wrap this with their own names and defaults.
 */
export function useListSettings(
  { guarded, cms }: ListSettingsDeps,
  resource: "music" | "playtime",
  defaults: () => ListValues,
) {
  const d = defaults();
  const initialCount = ref<number>(d.initialCount);
  const maxCount = ref<number>(d.maxCount);
  const defaultRange = ref<ActivityRange>(d.defaultRange);

  const save = () =>
    guarded(() =>
      cms.put(resource, {
        initialCount: initialCount.value,
        maxCount: maxCount.value,
        defaultRange: defaultRange.value,
      }),
    );

  function hydrate(v: Partial<ListValues> | undefined) {
    const def = defaults();
    initialCount.value = v?.initialCount ?? def.initialCount;
    maxCount.value = v?.maxCount ?? def.maxCount;
    defaultRange.value = v?.defaultRange ?? def.defaultRange;
  }

  return { initialCount, maxCount, defaultRange, save, hydrate };
}
