import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { contiguousDays, daysBefore } from "../lib/calendar";
import { useDayDrill } from "./useDayDrill";
import type { HeatCell } from "../components/ui/HeatGrid.vue";

/**
 * The clickable fortnight timeline shared by the Listening and Playtime modules.
 *
 * Both grew the identical wiring around {@link useDayDrill}: a contiguous
 * last-N-days strip (empty days zero-filled), heat cells bucketed by the day-max,
 * the index of the selected cell, and a click handler that drills into a day —
 * resolving `[]` with no network for a day known to be empty. This is that wiring,
 * once. It composes {@link useDayDrill} rather than reimplementing it, and stays
 * ignorant of *what* a day contains (tracks vs. games): the caller passes the
 * per-day fetcher, the empty-day value, and the cell-title formatter.
 *
 * `dayExpanded` (the day panel's "show more" toggle) lives here too, since it's
 * reset on every selection change alongside the drill.
 */
export function useLedgerStrip<T>(opts: {
  /** The per-day ledger (ref, getter, or raw), oldest first. */
  ledger: MaybeRefOrGetter<{ day: string; minutes: number }[]>;
  /** Load one day's detail. Only called for days with recorded minutes. */
  fetchDay: (iso: string) => Promise<T>;
  /** Resolved synchronously for a zero-minute day — no fetch. Typically `[]`. */
  emptyDay: T;
  /** A cell's hover title, e.g. `Mon 3 Mar · 40 min`. */
  title: (day: string, minutes: number) => string;
  /** Window length in days. Default 14 (the fortnight both modules show). */
  days?: number;
}) {
  const drill = useDayDrill<T>();
  const dayExpanded = ref(false);
  const todayIso = new Date().toISOString().slice(0, 10);
  const days = opts.days ?? 14;

  const rows = computed(() => toValue(opts.ledger));
  const maxDay = computed(() => Math.max(1, ...rows.value.map((x) => x.minutes)));
  const strip = computed(() => contiguousDays(rows.value, daysBefore(todayIso, days - 1), todayIso));

  // Linear quartile bucketing, local to the strip (relative to its own busiest
  // day), which is what makes a quiet fortnight still legible.
  const level = (min: number) => (min === 0 ? 0 : Math.min(4, Math.ceil((min / maxDay.value) * 4)));
  const cells = computed<HeatCell[]>(() =>
    strip.value.map((r) => ({ level: level(r.minutes), today: r.day === todayIso, title: opts.title(r.day, r.minutes) })),
  );

  const selectedIndex = computed(() => {
    if (!drill.selected.value) return null;
    const i = strip.value.findIndex((r) => r.day === drill.selected.value);
    return i >= 0 ? i : null;
  });

  function pick(iso: string, minutes: number) {
    dayExpanded.value = false;
    return drill.select(iso, () => (minutes === 0 ? Promise.resolve(opts.emptyDay) : opts.fetchDay(iso)));
  }
  function onSelect(i: number) {
    const r = strip.value[i];
    if (r) pick(r.day, r.minutes);
  }
  function clear() {
    dayExpanded.value = false;
    drill.clear();
  }

  return {
    /** The selected day (`YYYY-MM-DD`), or null for the top-level view. */
    selected: drill.selected,
    /** The loaded detail for the selected day, or null while loading/idle. */
    dayData: drill.data,
    dayLoading: drill.loading,
    dayError: drill.error,
    /** The day panel's "show more" toggle; reset on every selection change. */
    dayExpanded,
    /** The contiguous last-N-days window, oldest first. */
    strip,
    /** Heat cells for the strip, ready for `HeatStrip` / `HeatGrid`. */
    cells,
    /** Index of the selected day within the strip, or null. */
    selectedIndex,
    /** Handle a click on strip cell `i`. */
    onSelect,
    /** Close the drill and reset "show more". */
    clear,
  };
}
