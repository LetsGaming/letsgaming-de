<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import ModuleSection from "../ui/ModuleSection.vue";
import ModuleCard from "../ui/ModuleCard.vue";
import CardHeader from "../ui/CardHeader.vue";
import Freshness from "../ui/Freshness.vue";
import LanguageBars from "../ui/LanguageBars.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "coding" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note><Freshness :freshness="module.data.freshness" /></template>
    <ModuleCard v-if="module.data.coding">
      <CardHeader :note="`${module.data.coding.range} · ${module.data.coding.totalHours}h tracked`" />
      <LanguageBars :languages="module.data.coding.languages" />
    </ModuleCard>
    <p v-else class="sub">No coding time synced yet.</p>
  </ModuleSection>
</template>
