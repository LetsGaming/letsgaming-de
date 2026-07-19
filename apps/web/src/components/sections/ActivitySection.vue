<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import Freshness from "../ui/Freshness.vue";
import HeatGrid, { type HeatCell } from "../ui/HeatGrid.vue";
import LanguageBars from "../ui/LanguageBars.vue";
import { computed, ref } from "vue";

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
  <section :id="module.id" class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <Freshness :freshness="module.data.freshness" />
    </div>
    <div class="stats">
      <div v-for="(s, i) in module.data.stats" :key="i" class="stat">
        <div class="n">{{ s.value }}<small v-if="s.unit">{{ s.unit }}</small></div>
        <div class="l">{{ s.label }}</div>
      </div>
    </div>
    <div class="dash">
      <div class="box">
        <h3>Contributions</h3>
        <div class="sub">last 26 weeks · {{ module.data.contributions.total }} in the window</div>
        <HeatGrid :cells="contributionCells" legend />
      </div>
      <div class="box">
        <h3>Languages</h3>
        <div class="sub">across all public repos</div>
        <LanguageBars :languages="module.data.languages" />
      </div>
    </div>
    <div class="box" style="margin-top: 18px">
      <h3>Recent events</h3>
      <div class="sub">newest first</div>
      <div class="feed">
        <p v-if="!module.data.events.length" class="sub">Nothing synced from GitHub yet.</p>
        <component
          :is="e.href ? 'a' : 'div'"
          v-for="(e, i) in events"
          :key="i"
          class="ev"
          :class="{ 'ev-link': e.href }"
          :href="e.href"
          :target="e.href ? '_blank' : undefined"
          :rel="e.href ? 'noopener noreferrer' : undefined"
        >
          <span class="ei" v-html="icons[e.type]" />
          <div>
            <div class="et">{{ e.text }}</div>
            <div v-if="e.meta" class="em">{{ e.meta }}</div>
          </div>
          <span class="tm">{{ e.relative }}</span>
        </component>
        <button v-if="hidden > 0" class="more ev-more" @click="expanded = !expanded">
          {{ expanded ? "show less" : `show ${hidden} more` }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Activity's unique feed rules. The shared dashboard primitives (.stats, .stat,
 * .dash, .box, .heat, .tm, .more) stay global — Coding leans on them too. The
 * language bars moved to the LanguageBars component (scoped, no longer global).
 * The event icon comes from v-html, so `.ei svg` is :deep(svg). */
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
  font-size: 11px;
  color: var(--muted);
}
.ev .tm {
  margin-left: auto;
  font-family: var(--f-m);
  font-size: 11px;
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
