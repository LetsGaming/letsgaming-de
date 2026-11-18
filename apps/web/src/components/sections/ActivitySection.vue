<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import SmartLink from "../ui/SmartLink.vue";
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
    <div class="dash2">
      <div class="dash2__main">
        <CardHeader
          :title='t("contributions")'
          :note='t("contributionsScope", { n: module.data.contributions.total })'
        />
        <HeatGrid :cells="contributionCells" :min-cell="8" legend />
      </div>
      <div class="dash2__side">
        <CardHeader :title='t("languages")' :note='t("languagesScope")' />
        <LanguageBars :languages="module.data.languages" />
      </div>
    </div>
    <div class="activity-events">
      <CardHeader :title='t("recentEvents")' :note='t("newestFirst")' />
      <p v-if="!module.data.events.length" class="sub">{{ t("emptyActivity") }}</p>
      <ul v-else class="feed">
        <li v-for="(e, i) in events" :key="i">
          <SmartLink
            :href="e.href"
            as="div"
            class="ev"
            :class="{ 'ev-link': e.href }"
          >
            <span class="tm">{{ e.relative }}</span>
            <span class="ev-body">
              <span class="ei" v-html="icons[e.type]" />
              <span class="ev-text">
                <span class="et">{{ e.text }}</span>
                <span v-if="e.meta" class="em">{{ e.meta }}</span>
              </span>
            </span>
          </SmartLink>
        </li>
      </ul>
      <ListFooter class="ev-more" :more-count="hidden" :expanded="expanded" @toggle="expanded = !expanded" />
    </div>
  </ModuleSection>
</template>

<style scoped>
.figs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4) var(--space-5);
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
  padding-top: var(--space-3);
  border-top: 1px solid var(--line-1);
  min-width: 0;
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
  gap: var(--space-6);
  margin-top: var(--space-6);
}
@container (min-width: 720px) {
  .dash2 {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: var(--space-7);
  }
}

.activity-events {
  margin-top: var(--space-7);
}
.feed {
  margin: 0;
  padding: 0;
  list-style: none;
}
.feed li {
  border-top: 1px solid var(--line-1);
}
.ev {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  gap: var(--space-4);
  align-items: baseline;
  padding: var(--space-3) 0;
  color: inherit;
  text-decoration: none;
}
.tm {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.ev-body {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
  min-width: 0;
}
.ei {
  flex: none;
  display: inline-grid;
  place-items: center;
  align-self: center;
}
.ei :deep(svg) {
  width: 1rem;
  height: 1rem;
  color: var(--muted);
}
.ev-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.et {
  font-size: var(--fs-small);
  color: var(--ink);
  overflow-wrap: anywhere;
}
.em {
  font-family: var(--f-b);
  font-size: var(--fs-meta);
  color: var(--muted);
}
a.ev-link:hover .et,
a.ev-link:focus-visible .et {
  color: var(--ink-strong);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
.ev-more {
  border-top: 1px solid var(--line-1);
}
</style>
