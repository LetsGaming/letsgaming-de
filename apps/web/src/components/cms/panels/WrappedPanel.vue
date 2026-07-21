<script setup lang="ts">
import { computed } from "vue";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. State and the save handler come from the shared CMS context.
const {
  WRAPPED_BOUNDS,
  wrappedEnabled,
  wrappedEveryMonths,
  wrappedForWeeks,
  wrappedFromDate,
  wrappedTopCount,
  saveWrapped,
} = useCmsContext();

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

// Echo the schedule back in prose, so the effect of the numbers is legible.
const summary = computed(() =>
  wrappedEnabled.value
    ? `Shows for ${plural(wrappedForWeeks.value, "week")} every ${plural(wrappedEveryMonths.value, "month")}, ` +
      `starting ${wrappedFromDate.value || "—"} — each window sums up the ${plural(wrappedEveryMonths.value, "month")} just ended.`
    : "Off — the module never appears.",
);
</script>

<template>
  <section class="pane">
    <div class="card">
      <h3>Wrapped <span class="muted">(Life → “Wrapped”)</span></h3>
      <p class="muted">
        A periodic retrospective — top songs, artists, and games over a past stretch, in the spirit
        of Spotify Wrapped, built from what's already recorded. It appears only inside a window on the
        schedule below; the rest of the time the section isn't on the page at all. Hidden games are
        left out, the same as everywhere else.
      </p>

      <label class="wrow">
        <input type="checkbox" v-model="wrappedEnabled" />
        <span><b>Enable Wrapped</b><span class="muted"> — off by default</span></span>
      </label>

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
            <span class="muted">months</span>
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
            <span class="muted">weeks</span>
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
            <span class="muted">per list</span>
          </div>
        </div>
      </div>

      <p class="muted note">{{ summary }}</p>

      <div class="actions"><button class="btn" @click="saveWrapped">Save Wrapped</button></div>
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
.wrow {
  display: flex;
  align-items: center;
  gap: var(--sp-8);
  margin: var(--sp-12) 0;
  cursor: pointer;
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
.note {
  font-size: var(--fs-micro);
  margin-top: var(--sp-16);
}
</style>
