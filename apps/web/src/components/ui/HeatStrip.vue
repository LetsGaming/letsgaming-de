<script setup lang="ts">
/**
 * The labeled fortnight timeline: a caption row, the shared HeatGrid rendered as a
 * single row, and a start→today axis. The Listening and Playtime modules drew this
 * identically around the same HeatGrid; this is the wrapper, once. Cells and the
 * selected index come from `useLedgerStrip`; clicking a cell emits `select`.
 */
import HeatGrid, { type HeatCell } from "./HeatGrid.vue";
import { useT } from "~/composables/useT";

interface Props {
  cells: HeatCell[];
  selectedIndex: number | null;
  /** Label under the left edge — the oldest day shown. */
  startLabel: string;
}
defineProps<Props>();
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
