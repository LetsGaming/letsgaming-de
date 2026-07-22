import { ref } from "vue";
import { defaultWrappedSettings, WRAPPED_BOUNDS, type WrappedSettings } from "@lg/core";

/**
 * The Wrapped slice of the CMS — the recurring-display schedule. Same shape as the
 * other settings composables: refs + a save + a hydrate, spread into `useCms`'s
 * return so a panel that `inject()`s the context sees them. Bounds come from the
 * shared `WRAPPED_BOUNDS`, the same constant the write schema and server sanitizer
 * use, so input, schema, and sanitizer can't disagree.
 */
export interface WrappedDeps {
  guarded: (fn: () => Promise<unknown>) => Promise<void>;
  cms: { put: (resource: string, body: unknown) => Promise<unknown> };
}

export function useWrappedSettings({ guarded, cms }: WrappedDeps) {
  const d = defaultWrappedSettings();
  const wrappedEnabled = ref<boolean>(d.enabled);
  const wrappedEveryMonths = ref<number>(d.everyMonths);
  const wrappedForWeeks = ref<number>(d.forWeeks);
  const wrappedFromDate = ref<string>(d.fromDate);
  const wrappedTopCount = ref<number>(d.topCount);

  const saveWrapped = () =>
    guarded(() =>
      cms.put("wrapped", {
        enabled: wrappedEnabled.value,
        everyMonths: wrappedEveryMonths.value,
        forWeeks: wrappedForWeeks.value,
        fromDate: wrappedFromDate.value,
        topCount: wrappedTopCount.value,
      }),
    );

  function hydrate(w: Partial<WrappedSettings> | undefined) {
    const def = defaultWrappedSettings();
    wrappedEnabled.value = w?.enabled ?? def.enabled;
    wrappedEveryMonths.value = w?.everyMonths ?? def.everyMonths;
    wrappedForWeeks.value = w?.forWeeks ?? def.forWeeks;
    wrappedFromDate.value = w?.fromDate ?? def.fromDate;
    wrappedTopCount.value = w?.topCount ?? def.topCount;
  }

  return {
    WRAPPED_BOUNDS,
    wrappedEnabled,
    wrappedEveryMonths,
    wrappedForWeeks,
    wrappedTopCount,
    wrappedFromDate,
    saveWrapped,
    hydrateWrapped: hydrate,
  };
}
