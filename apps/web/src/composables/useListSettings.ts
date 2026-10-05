import { ref } from "vue";
import type { ActivityRange } from "@lg/core";
import { type Autosave, bindAutosave } from "./useAutosave";

export interface ListSettingsDeps {
  autosave: Autosave;
}

interface ListValues {
  initialCount: number;
  maxCount: number;
  defaultRange: ActivityRange;
}

/**
 * The state and autosave of a ranked-list module's display settings (rows shown, row cap,
 * opening window). Listening and Played are the same form over different resources;
 * their composables wrap this with their own names and defaults.
 */
export function useListSettings(
  { autosave }: ListSettingsDeps,
  resource: "music" | "playtime",
  label: string,
  defaults: () => ListValues,
) {
  const d = defaults();
  const initialCount = ref<number>(d.initialCount);
  const maxCount = ref<number>(d.maxCount);
  const defaultRange = ref<ActivityRange>(d.defaultRange);

  const confirm = bindAutosave(autosave, {
    path: resource,
    label,
    source: () => ({
      initialCount: initialCount.value,
      maxCount: maxCount.value,
      defaultRange: defaultRange.value,
    }),
  });

  function hydrate(v: Partial<ListValues> | undefined) {
    const def = defaults();
    initialCount.value = v?.initialCount ?? def.initialCount;
    maxCount.value = v?.maxCount ?? def.maxCount;
    defaultRange.value = v?.defaultRange ?? def.defaultRange;
    confirm();
  }

  return { initialCount, maxCount, defaultRange, hydrate };
}
