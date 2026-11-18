<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import { trackClick } from "../../lib/track";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import Freshness from "../ui/Freshness.vue";

const { t } = useT();
defineProps<{
  module: Extract<ResolvedModule, { kind: "glance" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note><Freshness :freshness="module.data.freshness" /></template>
    <div class="glance">
      <div v-if="module.data.stats.length" class="glance-figure">
        <span class="fig-n">{{ module.data.stats[0]?.value }}<small v-if="module.data.stats[0]?.unit">{{ module.data.stats[0]?.unit }}</small></span>
        <span class="fig-l">{{ module.data.stats[0]?.label }}</span>
      </div>
      <div class="glance-side">
        <ul v-if="module.data.stats.length > 1" class="glance-inline">
          <li v-for="(s, i) in module.data.stats.slice(1)" :key="i">
            <span class="inl-n">{{ s.value }}<small v-if="s.unit">{{ s.unit }}</small></span>
            {{ s.label }}
          </li>
        </ul>
        <p v-if="module.data.latest" class="glance-latest">
          {{ module.data.latest.text }}
          <span class="m">{{ t("ago", { age: module.data.latest.relative }) }}</span>
        </p>
        <p v-else-if="!module.data.stats.length" class="sub">{{ t("emptyGlance") }}</p>
        <SmartLink class="more glance-more" :href="module.data.moreHref" @click="() => trackClick('glance-more')">{{ t("fullActivity") }}</SmartLink>
      </div>
    </div>
  </ModuleSection>
</template>

<style scoped>
.glance {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);
  align-items: end;
}
@container (min-width: 560px) {
  .glance {
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-7);
  }
}
.glance-figure {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.fig-n {
  font-family: var(--f-d);
  font-weight: 700;
  font-stretch: 75%;
  font-size: var(--fs-figure);
  line-height: 1;
  color: var(--ink-strong);
  font-variant-numeric: tabular-nums;
}
.fig-n small {
  margin-left: var(--space-2);
  font-family: var(--f-b);
  font-stretch: 100%;
  font-size: var(--fs-h3);
  font-weight: 600;
  color: var(--muted);
}
.fig-l {
  font-size: var(--fs-body);
  color: var(--muted);
}
.glance-side {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 0;
}
.glance-inline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--fs-small);
  color: var(--muted);
}
.inl-n {
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.inl-n small {
  margin-left: var(--space-1);
  font: inherit;
  color: var(--muted);
}
.glance-latest {
  max-width: 50ch;
  margin: 0;
  font-size: var(--fs-body);
  overflow-wrap: anywhere;
}
.glance-latest .m {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
}
</style>
