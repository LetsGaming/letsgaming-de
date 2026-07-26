<script setup lang="ts">
/**
 * The window control on the Listening and Played cards: the span currently shown,
 * and a segmented picker to change it.
 *
 * A viewer control, the same shape as the owner/local timezone toggle it sits
 * beside — picking a value makes the module re-request itself from
 * `/api/module/:id` with that range, and the server rebuilds the totals, the top
 * lists and the ledger over the new span. Nothing is re-sliced client-side except
 * the strip, which follows the same number.
 *
 * A component rather than a composable because the note and the picker have to be
 * *one* flex child: `CardHeader`'s note slot is spaced with `space-between`, so
 * handing it two elements pushes the label to the middle of the header. Grouping
 * them is the whole reason this isn't two tags at each call site.
 *
 * The two labels differ on purpose. The picker segment is abbreviated ("3m") to fit
 * a card header; the note spells the window out ("last 3 months") because it is the
 * part that has to still make sense once the picker has scrolled out of view.
 */
import { computed } from "vue";
import { ACTIVITY_RANGES, ACTIVITY_RANGE_LABELS, type ActivityRange } from "@lg/core";
import { useT } from "~/composables/useT";
import SegmentedControl from "./SegmentedControl.vue";

const props = defineProps<{
  /**
   * The window the *rendered data* covers — not the selection.
   *
   * These differ while a re-fetch is in flight, and the note follows the data on
   * purpose: labelling the rows on screen "last year" a moment before the year's
   * rows arrive is the one thing this caption exists to prevent.
   */
  windowDays: ActivityRange;
}>();

const model = defineModel<ActivityRange>({ required: true });

const { t } = useT();

const options = computed(() =>
  ACTIVITY_RANGES.map((days) => ({ value: days, label: t(ACTIVITY_RANGE_LABELS[days].short) })),
);
const note = computed(() => t(ACTIVITY_RANGE_LABELS[props.windowDays].long));
</script>

<template>
  <span class="arp">
    <span class="arp__note">{{ note }}</span>
    <SegmentedControl v-model="model" :options="options" :label='t("rangeLabel")' size="sm" />
  </span>
</template>

<style scoped>
.arp {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-8);
}
/* Matches CardHeader's live note — this replaces that note rather than sitting
   next to it, so it has to read as the same caption. */
.arp__note {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--live-ink);
}
</style>
