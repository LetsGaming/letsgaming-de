<script setup lang="ts">
/**
 * The labeled day timeline: a caption row, the shared HeatGrid, and a start→today
 * axis. The Listening and Playtime modules drew this identically around the same
 * HeatGrid; this is the wrapper, once. Cells, the selected index and the layout all
 * come from `useLedgerStrip`; clicking a cell emits `select`.
 *
 * `rows`/`cellHeight` are the layout the window length implies, not a styling
 * choice: a fortnight is one row of tall cells, and a year wraps to seven rows of
 * short ones because 365 cells in a line is ~2900px of sideways scroll. Every cell
 * is still one day at every length, so the drill-in works the same throughout.
 */
import HeatGrid, { type HeatCell } from "./HeatGrid.vue";
import { useT } from "~/composables/useT";

interface Props {
  cells: HeatCell[];
  selectedIndex: number | null;
  /** Label under the left edge — the oldest day shown. */
  startLabel: string;
  /** Cells per column: 1 is a single strip, 7 wraps into weeks. */
  rows?: number;
  /** Fixed cell height in px, so a short strip doesn't balloon. */
  cellHeight?: number;
}
withDefaults(defineProps<Props>(), { rows: 1, cellHeight: 30 });
const emit = defineEmits<{ select: [index: number] }>();

// The captions were `captionLeft`/`captionRight` props with English defaults that
// neither caller ever overrode — speculative props hiding three untranslated
// strings on a component both ledger modules render.
const { t } = useT();
</script>

<template>
  <div class="hs">
    <div class="hs-lbl"><span>{{ t("minutesPerDay") }}</span><span>{{ t("clickDayToDrill") }}</span></div>
    <HeatGrid
      :cells="cells"
      :rows="rows"
      :min-cell="8"
      :cell-height="cellHeight"
      legend
      selectable
      :selected-index="selectedIndex"
      @select="emit('select', $event)"
    />
    <div class="hs-axis">
      <span>{{ startLabel }}</span>
      <span class="now">{{ t("today") }}</span>
    </div>
  </div>
</template>

<style scoped>
.hs {
  margin-bottom: var(--sp-16);
}
.hs-lbl {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  margin-bottom: var(--sp-8);
}
.hs-axis {
  display: flex;
  justify-content: space-between;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  margin-top: var(--sp-6);
}
.hs-axis .now {
  color: var(--live-ink);
}
</style>
