import { ref, shallowRef, type Ref } from "vue";

/**
 * One day's detail, fetched on demand behind a clickable timeline.
 *
 * Playtime and Music grew the identical state machine — a selected day, a
 * fetched-on-click payload, loading/error flags, click-again-to-close — differing
 * only in the endpoint and the row shape. This is that machine, once. The section
 * passes a `loader` per click so the composable stays ignorant of *what* it's
 * loading (games vs. tracks); it only owns the *when*.
 *
 * `select` takes the loader rather than a URL so a day known to be empty (zero
 * minutes) can resolve `[]` synchronously with no network call — the same
 * "a silent day is a real answer" shortcut both sections had, now in one place.
 */
export interface DayDrill<T> {
  /** The selected day (`YYYY-MM-DD`), or null for "nothing drilled in". */
  selected: Ref<string | null>;
  /** The loaded payload for the selected day, or null while loading/idle. */
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<boolean>;
  /** Select a day and load it. Clicking the selected day again closes the drill. */
  select: (day: string, loader: () => Promise<T>) => Promise<void>;
  clear: () => void;
}

export function useDayDrill<T>(): DayDrill<T> {
  const selected = ref<string | null>(null);
  // shallowRef: the payload is an opaque list handed straight to the template;
  // nothing reads *into* it reactively, so deep tracking would be wasted work.
  const data = shallowRef<T | null>(null);
  const loading = ref(false);
  const error = ref(false);

  function clear() {
    selected.value = null;
    data.value = null;
    error.value = false;
    loading.value = false;
  }

  async function select(day: string, loader: () => Promise<T>) {
    if (selected.value === day) return clear(); // click the open day again → close
    selected.value = day;
    data.value = null;
    error.value = false;
    loading.value = true;
    try {
      data.value = await loader();
    } catch {
      error.value = true;
    } finally {
      loading.value = false;
    }
  }

  return { selected, data, loading, error, select, clear };
}
