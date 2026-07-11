<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { trackClick } from "../../lib/track";

defineProps<{
  module: Extract<ResolvedModule, { kind: "glance" }>;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();
</script>

<template>
  <section class="sec rise">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <button class="more" @click="() => { trackClick('more'); go('work'); }">full activity →</button>
    </div>
    <div class="stats">
      <div v-for="(s, i) in module.data.stats" :key="i" class="stat">
        <div class="n">{{ s.value }}<small v-if="s.unit">{{ s.unit }}</small></div>
        <div class="l">{{ s.label }}</div>
      </div>
    </div>
  </section>
</template>
