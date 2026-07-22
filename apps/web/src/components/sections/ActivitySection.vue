<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import ModuleCard from "../ui/ModuleCard.vue";
import CardHeader from "../ui/CardHeader.vue";
import Freshness from "../ui/Freshness.vue";
import HeatGrid, { type HeatCell } from "../ui/HeatGrid.vue";
import LanguageBars from "../ui/LanguageBars.vue";
import { computed, ref } from "vue";

const { t } = useT();
const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "activity" }>;
}>();

/** Five is enough to read at a glance; the rest is there when you want it. */
const EVENTS_SHOWN = 5;
const expanded = ref(false);
const events = computed(() =>
  expanded.value ? props.module.data.events : props.module.data.events.slice(0, EVENTS_SHOWN),
);
const hidden = computed(() => props.module.data.events.length - EVENTS_SHOWN);

// Levels are bucketed on the server; the grid just needs {level} per day.
const contributionCells = computed<HeatCell[]>(() =>
  props.module.data.contributions.levels.map((level) => ({ level })),
);
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note><Freshness :freshness="module.data.freshness" /></template>
    <div class="stats">
      <div v-for="(s, i) in module.data.stats" :key="i" class="stat">
        <div class="n">{{ s.value }}<small v-if="s.unit">{{ s.unit }}</small></div>
        <div class="l">{{ s.label }}</div>
      </div>
    </div>
    <div class="dash">
      <ModuleCard>
        <CardHeader
          :title='t("contributions")'
          :note='t("contributionsScope", { n: module.data.contributions.total })'
        />
        <HeatGrid :cells="contributionCells" legend />
      </ModuleCard>
      <ModuleCard>
        <CardHeader :title='t("languages")' :note='t("languagesScope")' />
        <LanguageBars :languages="module.data.languages" />
      </ModuleCard>
    </div>
    <ModuleCard class="activity-events">
      <CardHeader :title='t("recentEvents")' :note='t("newestFirst")' />
      <div class="feed">
        <p v-if="!module.data.events.length" class="sub">{{ t("emptyActivity") }}</p>
        <SmartLink
          v-for="(e, i) in events"
          :key="i"
          :href="e.href"
          as="div"
          class="ev"
          :class="{ 'ev-link': e.href }"
        >
          <span class="ei" v-html="icons[e.type]" />
          <div>
            <div class="et">{{ e.text }}</div>
            <div v-if="e.meta" class="em">{{ e.meta }}</div>
          </div>
          <span class="tm">{{ e.relative }}</span>
        </SmartLink>
        <button v-if="hidden > 0" class="more ev-more" @click="expanded = !expanded">
          {{ expanded ? "show less" : `show ${hidden} more` }}
        </button>
      </div>
    </ModuleCard>
  </ModuleSection>
</template>

<style scoped>
/* Activity's unique feed rules. The stat row (.stats, .stat, .dash) stays global —
 * it's the same dashboard grid Glance uses; the card surface and header are the
 * ModuleCard / CardHeader components. The event icon comes from v-html, so
 * `.ei svg` is :deep(svg). */
.activity-events {
  margin-top: var(--sp-18);
}
.feed {
  display: flex;
  flex-direction: column;
}
.ev {
  display: flex;
  gap: var(--sp-12);
  align-items: flex-start;
  padding: 11px 0;
  border-top: 1px solid var(--line-1);
}
.ev:first-child {
  border-top: none;
}
.ev .ei {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--surf-2);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.ev .ei :deep(svg) {
  width: 15px;
  height: 15px;
  color: var(--ink);
}
.ev .et {
  font-size: 13px;
  color: var(--ink);
}
.ev .et b {
  color: var(--ink-strong);
  font-weight: 600;
}
.ev .em {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
.ev .tm {
  margin-left: auto;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  white-space: nowrap;
}
/* Clickable feed rows (highlights): no underline; nudge the title on hover. */
a.ev-link {
  text-decoration: none;
}
a.ev-link:hover .et {
  color: var(--ink);
}
a.ev-link:hover .ei {
  background: var(--ink);
}
a.ev-link:hover .ei :deep(svg) {
  color: #fff;
}
.ev-more {
  margin-top: var(--sp-8);
  align-self: flex-start;
}
</style>
