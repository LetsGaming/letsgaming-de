<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import ModuleSection from "../ui/ModuleSection.vue";
import ModuleCard from "../ui/ModuleCard.vue";
import Freshness from "../ui/Freshness.vue";
import LanguageBars from "../ui/LanguageBars.vue";

const { t } = useT();
defineProps<{
  module: Extract<ResolvedModule, { kind: "coding" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note><Freshness :freshness="module.data.freshness" /></template>
    <ModuleCard v-if="module.data.coding">
      <div class="coding">
        <p class="coding-scope">{{ t("codingScope", { range: module.data.coding.range, hours: module.data.coding.totalHours }) }}</p>
        <LanguageBars :languages="module.data.coding.languages" />
      </div>
    </ModuleCard>
    <p v-else class="sub">{{ t("emptyCoding") }}</p>
  </ModuleSection>
</template>

<style scoped>
.coding {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}
.coding-scope {
  margin: 0;
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h3);
  line-height: 1.3;
  color: var(--ink-strong);
}
@container (min-width: 720px) {
  .coding {
    grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr);
    gap: var(--space-8);
    align-items: start;
  }
  .coding-scope {
    font-size: var(--fs-h2);
    line-height: 1.25;
  }
}
</style>
