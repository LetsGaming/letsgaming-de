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
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-1) var(--space-5);
  align-items: baseline;
  padding: var(--space-3) var(--space-6) var(--space-3) 0;
  color: inherit;
  text-decoration: none;
}
.row::after {
  content: "";
  position: absolute;
  top: calc(var(--space-3) + var(--fs-h1) * 0.5 - 0.3rem);
  right: var(--space-1);
  width: 0.6rem;
  height: 0.6rem;
  border-top: 2px solid var(--muted);
  border-right: 2px solid var(--muted);
  transform: rotate(45deg);
}
.row:hover::after,
.row:focus-visible::after {
  border-color: var(--ink-strong);
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
  font-size: var(--fs-body);
  line-height: 1.3;
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
    padding: var(--space-4) var(--space-6) var(--space-4) 0;
  }
  .row::after {
    top: 50%;
    margin-top: -0.3rem;
  }
}
</style>
