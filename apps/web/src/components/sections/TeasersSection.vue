<script setup lang="ts">
/**
 * A ruled index list, one row per area, each row a real link into it. The data is
 * resolved with the rest of the view, so this renders on first paint like any
 * other module.
 */
import type { ResolvedModule } from "@lg/core";
import { trackClick } from "../../lib/track";
import ModuleSection from "../ui/ModuleSection.vue";
import SmartLink from "../ui/SmartLink.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "teasers" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note" variant="ruled">
    <ul class="index">
      <li v-for="c in module.data.teasers" :key="c.id">
        <SmartLink class="row" :href="c.href" @click="trackClick('teaser')">
          <span class="row__name">{{ c.label }}</span>
          <span class="row__value">{{ c.value }}</span>
          <span v-if="c.detail" class="row__detail">{{ c.detail }}</span>
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
.index li {
  border-bottom: 1px solid var(--line-1);
}
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: var(--space-4);
  row-gap: var(--space-1);
  align-items: baseline;
  padding: var(--space-3) 0;
  color: inherit;
  text-decoration: none;
}
.row__name {
  font-size: var(--fs-h3);
  font-weight: 600;
  color: var(--ink-strong);
}
.row:hover .row__name,
.row:focus-visible .row__name {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
.row__value {
  grid-column: 2;
  grid-row: 1;
  max-width: 14em;
  text-align: right;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.row__detail {
  grid-column: 1 / -1;
  font-size: var(--fs-small);
  color: var(--muted);
}
</style>
