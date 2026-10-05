import { ref } from "vue";
import { type Autosave, bindAutosave } from "./useAutosave";
import { defaultWrappedSettings, WRAPPED_BOUNDS, type WrappedSettings } from "@lg/core";

/**
 * The Wrapped slice of the CMS — the recurring-display schedule. Same shape as the
 * other settings composables: refs + a save + a hydrate, spread into `useCms`'s
 * return so a panel that `inject()`s the context sees them. Bounds come from the
 * shared `WRAPPED_BOUNDS`, the same constant the write schema and server sanitizer
 * use, so input, schema, and sanitizer can't disagree.
 */
export interface WrappedDeps {
  autosave: Autosave;
}

export function useWrappedSettings({ autosave }: WrappedDeps) {
  const d = defaultWrappedSettings();
  const wrappedEnabled = ref<boolean>(d.enabled);
  const wrappedEveryMonths = ref<number>(d.everyMonths);
  const wrappedForWeeks = ref<number>(d.forWeeks);
  const wrappedFromDate = ref<string>(d.fromDate);
  const wrappedTopCount = ref<number>(d.topCount);

  const confirm = bindAutosave(autosave, {
    path: "wrapped",
    label: "Edit Wrapped settings",
    source: () => ({
      enabled: wrappedEnabled.value,
      everyMonths: wrappedEveryMonths.value,
      forWeeks: wrappedForWeeks.value,
      fromDate: wrappedFromDate.value,
      topCount: wrappedTopCount.value,
    }),
  });

  function hydrate(w: Partial<WrappedSettings> | undefined) {
    const def = defaultWrappedSettings();
    wrappedEnabled.value = w?.enabled ?? def.enabled;
    wrappedEveryMonths.value = w?.everyMonths ?? def.everyMonths;
    wrappedForWeeks.value = w?.forWeeks ?? def.forWeeks;
    wrappedFromDate.value = w?.fromDate ?? def.fromDate;
    wrappedTopCount.value = w?.topCount ?? def.topCount;
    confirm();
  }

  return {
    WRAPPED_BOUNDS,
    wrappedEnabled,
    wrappedEveryMonths,
    wrappedForWeeks,
    wrappedTopCount,
    wrappedFromDate,
    hydrateWrapped: hydrate,
  };
}
