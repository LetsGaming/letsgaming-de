<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import Freshness from "../ui/Freshness.vue";
import LanguageBars from "../ui/LanguageBars.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "coding" }>;
}>();
</script>

<template>
  <section :id="module.id" class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <Freshness :freshness="module.data.freshness" />
    </div>
    <div v-if="module.data.coding" class="box">
      <div class="sub">{{ module.data.coding.range }} · {{ module.data.coding.totalHours }}h tracked</div>
      <LanguageBars :languages="module.data.coding.languages" />
    </div>
    <p v-else class="sub">No coding time synced yet.</p>
  </section>
</template>
