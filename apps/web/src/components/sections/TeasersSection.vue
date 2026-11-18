<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { trackClick } from "../../lib/track";
import ModuleSection from "../ui/ModuleSection.vue";
import SmartLink from "../ui/SmartLink.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "teasers" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note" gap="group">
    <ul class="index">
      <li v-for="c in module.data.teasers" :key="c.id">
        <SmartLink class="row" :href="c.href" @click="trackClick('teaser')">
          <span class="row__name">{{ c.label }}</span>
          <span class="row__facts">
            <span class="row__value">{{ c.value }}</span>
            <span v-if="c.detail" class="row__detail">{{ c.detail }}</span>
          </span>
        </SmartLink>
      </li>
    </ul>
  </ModuleSection>
</template>

<style scoped>
.index {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-1) var(--space-5);
  align-items: baseline;
  padding: var(--space-3) 0;
  color: inherit;
  text-decoration: none;
}
.row__name {
  font-family: var(--f-d);
  font-weight: 700;
  font-stretch: 75%;
  font-size: var(--fs-h1);
  line-height: 1.05;
  color: var(--ink-strong);
  overflow-wrap: anywhere;
}
.row:hover .row__name,
.row:focus-visible .row__name {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.12em;
}
.row__facts {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.row__value {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.row__detail {
  font-size: var(--fs-small);
  color: var(--muted);
  overflow-wrap: anywhere;
}
@container (min-width: 560px) {
  .row {
    grid-template-columns: minmax(0, 5fr) minmax(0, 4fr);
    padding: var(--space-4) 0;
  }
}
</style>
