<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import ModuleSection from "../ui/ModuleSection.vue";
import ModuleCard from "../ui/ModuleCard.vue";
import CardHeader from "../ui/CardHeader.vue";
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
      <CardHeader :note='t("codingScope", { range: module.data.coding.range, hours: module.data.coding.totalHours })' />
      <LanguageBars :languages="module.data.coding.languages" />
    </ModuleCard>
    <p v-else class="sub">{{ t("emptyCoding") }}</p>
  </ModuleSection>
</template>
