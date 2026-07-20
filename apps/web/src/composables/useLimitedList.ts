import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from "vue";

/**
 * A list shown up to a hard cap, with one "show more"/"show less" toggle between an
 * initial count and the cap, and an "and N more" note for whatever the cap hides.
 *
 * One implementation for every capped list on the activity modules — the top
 * songs/artists list, the top-games list, and both per-day drill-ins — so the rule
 * "collapse to `initial`, expand no further than `max`, then say how many the limit
 * hid" lives in exactly one place. Previously each section reimplemented it, and the
 * day panels forgot the cap entirely (they expanded to the whole day), which is the
 * bug this fixes.
 *
 * `rows` is what's on hand to render. `total` is the true count when it can exceed
 * that — the server already trims the main lists to the cap, so their real length
 * comes from a separate count (distinct tracks/artists); the day drill-ins ship the
 * whole day, so `total` defaults to `rows.length`. Either way the cap is applied
 * here, so nothing downstream can leak past it.
 */
export function useLimitedList<T>(opts: {
  rows: MaybeRefOrGetter<T[]>;
  initial: MaybeRefOrGetter<number>;
  max: MaybeRefOrGetter<number>;
  /** The true total when `rows` may be shorter than it (a server-capped list). */
  total?: MaybeRefOrGetter<number>;
  /** Reuse an existing expanded ref (the day panel shares the strip's, which resets
   *  when the selected day changes); omit for a self-owned one. */
  expanded?: Ref<boolean>;
}) {
  const expanded = opts.expanded ?? ref(false);

  const rows = computed(() => toValue(opts.rows));
  const initial = computed(() => Math.max(1, Math.floor(toValue(opts.initial))));
  const max = computed(() => Math.max(initial.value, Math.floor(toValue(opts.max))));
  const total = computed(() => Math.max(rows.value.length, opts.total !== undefined ? toValue(opts.total) : 0));

  // Never render past the cap, even when more rows are on hand (the day drill-in
  // ships the whole day; this is where its cap is enforced).
  const capped = computed(() => rows.value.slice(0, max.value));
  const shown = computed(() => (expanded.value ? capped.value : capped.value.slice(0, initial.value)));

  // What "show more" reveals: from `initial` up to the cap (or fewer if that's all).
  const moreCount = computed(() => Math.max(0, capped.value.length - initial.value));
  // What the cap hides for good — shown as "and N more", never expandable.
  const overflow = computed(() => Math.max(0, total.value - max.value));
  // At the cap when fully expanded, or when there was never anything to expand.
  const atCap = computed(() => expanded.value || moreCount.value === 0);

  const reset = () => {
    expanded.value = false;
  };

  return { shown, expanded, moreCount, overflow, atCap, reset };
}
