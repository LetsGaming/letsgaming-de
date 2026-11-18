<script setup lang="ts">
/**
 * The live strip: the last 28 days of real activity, one cell per day, under the
 * header on every page. It is the site's one identity device: the page claims to
 * update itself, and this is the evidence, drawn from the same synced data.
 *
 * Every cell is a real day. The ramp is the violet data scale; only today's cell
 * is the bright signal, and only when today has activity (see `HeatGrid`). The
 * strip is not interactive: cells carry a native tooltip for a pointer, and the
 * whole strip has one accessible summary, so a screen reader hears one sentence
 * instead of 28 stops.
 */
import { computed } from "vue";
import type { PulseView } from "@lg/core";
import { useT } from "~/composables/useT";
import HeatGrid, { type HeatCell } from "../ui/HeatGrid.vue";

const props = defineProps<{ pulse: PulseView; synced?: string }>();
const { t, plural, duration, day } = useT();

const summary = (i: number): string => {
  const c = props.pulse.counts[i];
  const parts = c
    ? [
        ...(c.commits ? [`${c.commits} ${plural("commit", c.commits)}`] : []),
        ...(c.gameMinutes ? [t("pulsePlayed", { time: duration(c.gameMinutes) })] : []),
        ...(c.listenMinutes ? [t("pulseListened", { time: duration(c.listenMinutes) })] : []),
      ]
    : [];
  return parts.length ? parts.join(", ") : t("pulseNone");
};

const last = computed(() => props.pulse.days.length - 1);
const cells = computed<HeatCell[]>(() =>
  props.pulse.days.map((d, i) => ({
    level: props.pulse.levels[i] ?? 0,
    today: i === last.value,
    title: `${day(d)}: ${summary(i)}`,
  })),
);
const label = computed(() => t("pulseAria", { today: summary(last.value) }));
</script>

<template>
  <div class="pulse">
    <HeatGrid :cells="cells" :rows="1" :cell-height="14" :min-cell="8" :label="label" />
    <p class="pulse__cap">
      <span>{{ t("pulseLabel") }}</span>
      <span v-if="synced">{{ t("freshFresh", { age: synced }) }}</span>
    </p>
  </div>
</template>

<style scoped>
.pulse {
  margin: calc(var(--space-4) * -1) 0 var(--space-6);
}
.pulse__cap {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  margin: var(--space-1) 0 0;
  padding: 0 var(--sp-4);
  font-size: var(--fs-meta);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
