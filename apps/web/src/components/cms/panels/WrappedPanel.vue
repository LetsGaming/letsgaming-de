<script setup lang="ts">
import { computed } from "vue";
import { useCmsContext } from "../../../composables/cmsContext";
import { formatDate, nextWrappedWindow } from "../../../lib/cmsInspector";
import HelpTip from "../HelpTip.vue";
import ToggleSwitch from "../ToggleSwitch.vue";

// View-only panel. State and the save handler come from the shared CMS context.
const {
  WRAPPED_BOUNDS,
  wrappedEnabled,
  wrappedEveryMonths,
  wrappedForWeeks,
  wrappedFromDate,
  wrappedTopCount,
} = useCmsContext();

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
// The browser's own locale, so the sentence matches what the date input shows.
const tag = typeof navigator === "undefined" ? undefined : navigator.language;

const summary = computed(() =>
  wrappedEnabled.value
    ? `Shows for ${plural(wrappedForWeeks.value, "week")} every ${plural(wrappedEveryMonths.value, "month")}, ` +
      `starting ${wrappedFromDate.value ? formatDate(wrappedFromDate.value, tag) : "(pick a date)"}. ` +
      `Each window sums up the ${plural(wrappedEveryMonths.value, "month")} just ended.`
    : "Off: the module never appears.",
);

const nextWindow = computed(() => {
  const w = nextWrappedWindow(
    {
      enabled: wrappedEnabled.value,
      everyMonths: wrappedEveryMonths.value,
      forWeeks: wrappedForWeeks.value,
      fromDate: wrappedFromDate.value,
      topCount: wrappedTopCount.value,
    },
    new Date(),
  );
  if (!w) return null;
  return w.kind === "open"
    ? `Showing now, until ${formatDate(w.end, tag)}`
    : `Next window: ${formatDate(w.start, tag)}`;
});
</script>

<template>
  <section class="pane">
    <div class="card">
      <h3>Wrapped</h3>
      <p class="help">
        A periodic look back at your top songs, artists and games.
        <HelpTip text="It appears only inside a window on the schedule below; the rest of the time the section is not on the page at all. It is built from what is already recorded, and hidden games are left out as everywhere else." />
      </p>

      <ToggleSwitch v-model="wrappedEnabled" class="wtoggle">Enable Wrapped</ToggleSwitch>

      <div class="wgrid" :class="{ off: !wrappedEnabled }">
        <div class="wfield">
          <h4>Show every</h4>
          <div class="winline">
            <input
              v-model.number="wrappedEveryMonths"
              type="number"
              class="num"
              :min="WRAPPED_BOUNDS.everyMonths.min"
              :max="WRAPPED_BOUNDS.everyMonths.max"
              :disabled="!wrappedEnabled"
            />
            <span class="help">months</span>
          </div>
        </div>

        <div class="wfield">
          <h4>For</h4>
          <div class="winline">
            <input
              v-model.number="wrappedForWeeks"
              type="number"
              class="num"
              :min="WRAPPED_BOUNDS.forWeeks.min"
              :max="WRAPPED_BOUNDS.forWeeks.max"
              :disabled="!wrappedEnabled"
            />
            <span class="help">weeks</span>
          </div>
        </div>

        <div class="wfield">
          <h4>Starting from</h4>
          <input v-model="wrappedFromDate" type="date" class="num wdate" :disabled="!wrappedEnabled" />
        </div>

        <div class="wfield">
          <h4>Top rows</h4>
          <div class="winline">
            <input
              v-model.number="wrappedTopCount"
              type="number"
              class="num"
              :min="WRAPPED_BOUNDS.topCount.min"
              :max="WRAPPED_BOUNDS.topCount.max"
              :disabled="!wrappedEnabled"
            />
            <span class="help">per list</span>
          </div>
        </div>
      </div>

      <p class="help wsummary">{{ summary }}</p>
      <p v-if="nextWindow" class="help wnext">{{ nextWindow }}</p>

    </div>
  </section>
</template>

<style scoped>
.pane h4 {
  margin: 0 0 var(--sp-4);
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
}
.wtoggle {
  margin: var(--sp-12) 0;
}
.wgrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-16);
  margin-top: var(--sp-8);
  transition: opacity var(--dur-fast) var(--ease-out);
}
.wgrid.off {
  opacity: 0.55;
}
.winline {
  display: flex;
  align-items: baseline;
  gap: var(--sp-8);
}
.num {
  font: inherit;
  font-size: 13px;
  background: var(--card-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  padding: 6px var(--sp-10);
  width: 84px;
}
.wdate {
  width: auto;
}
.wsummary {
  margin-top: var(--sp-16);
}
.wnext {
  margin-top: var(--sp-4);
  font-weight: 600;
}
</style>
