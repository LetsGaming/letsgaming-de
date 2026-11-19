<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import EventRow from "../ui/EventRow.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import CardHeader from "../ui/CardHeader.vue";
import Freshness from "../ui/Freshness.vue";
import HeatGrid, { type HeatCell } from "../ui/HeatGrid.vue";
import LanguageBars from "../ui/LanguageBars.vue";
import ListFooter from "../ui/ListFooter.vue";
import { useLimitedList } from "../../composables/useLimitedList";
import { computed } from "vue";

const { t, plural, day } = useT();
const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "activity" }>;
}>();

const EVENTS_SHOWN = 5;
const allEvents = computed(() => props.module.data.events);
const {
  shown: events,
  expanded,
  moreCount: hidden,
} = useLimitedList({
  rows: allEvents,
  initial: EVENTS_SHOWN,
  max: () => allEvents.value.length,
});

// Levels are bucketed on the server. The tooltip reads the raw count and calendar
// date, not the bucketed shade.
const contributionCells = computed<HeatCell[]>(() => {
  const { levels, counts, dates } = props.module.data.contributions;
  return levels.map((level, i) => ({
    level,
    title: t("commitsOnDay", {
      n: counts[i] ?? 0,
      noun: plural("commit", counts[i] ?? 0),
      date: day(dates[i] ?? ""),
    }),
  }));
});
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note><Freshness :freshness="module.data.freshness" /></template>
    <ul v-if="module.data.stats.length" class="figs">
      <li v-for="(s, i) in module.data.stats" :key="i">
        <span class="fig-n">{{ s.value }}<small v-if="s.unit">{{ s.unit }}</small></span>
        <span class="fig-l">{{ s.label }}</span>
      </li>
    </ul>
    <div class="heat">
      <CardHeader
        :title='t("contributions")'
        :note='t("contributionsScope", { n: module.data.contributions.total })'
      />
      <HeatGrid :cells="contributionCells" :min-cell="8" :label='t("contributions")' legend />
    </div>
    <div class="dash2">
      <div class="activity-events">
        <CardHeader :title='t("recentEvents")' :note='t("newestFirst")' />
        <p v-if="!module.data.events.length" class="sub">{{ t("emptyActivity") }}</p>
        <ul v-else class="feed">
          <li v-for="(e, i) in events" :key="i">
            <EventRow :event="e" />
          </li>
        </ul>
        <ListFooter :more-count="hidden" :expanded="expanded" @toggle="expanded = !expanded" />
      </div>
      <div class="dash2__side">
        <CardHeader :title='t("languages")' :note='t("languagesScope")' />
        <LanguageBars :languages="module.data.languages" />
      </div>
    </div>
  </ModuleSection>
</template>

<style scoped>
.figs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5) var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;
}
@container (min-width: 560px) {
  .figs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.figs li {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.heat {
  margin-top: var(--space-7);
}
.fig-n {
  font-family: var(--f-d);
  font-weight: 700;
  font-size: var(--fs-figure);
  line-height: 1;
  color: var(--ink-strong);
  font-variant-numeric: tabular-nums;
}
.fig-n small {
  margin-left: var(--space-1);
  font-family: var(--f-b);
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--muted);
}
.fig-l {
  font-size: var(--fs-small);
  color: var(--muted);
}

.dash2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-7);
  margin-top: var(--space-7);
}
@container (min-width: 720px) {
  .dash2 {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: var(--space-8);
  }
}

.activity-events {
  min-width: 0;
}
.feed {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
