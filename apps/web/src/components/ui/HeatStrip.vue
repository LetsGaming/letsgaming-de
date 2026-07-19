<script setup lang="ts">
/**
 * The labeled fortnight timeline: a caption row, the shared HeatGrid rendered as a
 * single row, and a start→today axis. The Listening and Playtime modules drew this
 * identically around the same HeatGrid; this is the wrapper, once. Cells and the
 * selected index come from `useLedgerStrip`; clicking a cell emits `select`.
 */
import HeatGrid, { type HeatCell } from "./HeatGrid.vue";

interface Props {
  cells: HeatCell[];
  selectedIndex: number | null;
  /** Label under the left edge — the oldest day shown. */
  startLabel: string;
  /** Caption above the strip. Defaults describe the interaction. */
  captionLeft?: string;
  captionRight?: string;
}
withDefaults(defineProps<Props>(), {
  captionLeft: "minutes per day",
  captionRight: "click a day to drill in",
});
const emit = defineEmits<{ select: [index: number] }>();
</script>

<template>
  <div class="hs">
    <div class="hs-lbl"><span>{{ captionLeft }}</span><span>{{ captionRight }}</span></div>
    <HeatGrid
      :cells="cells"
      :rows="1"
      :min-cell="8"
      :cell-height="30"
      legend
      selectable
      :selected-index="selectedIndex"
      @select="emit('select', $event)"
    />
    <div class="hs-axis">
      <span>{{ startLabel }}</span>
      <span class="now">today</span>
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
