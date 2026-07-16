<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { trackClick } from "../../lib/track";
import Freshness from "../Freshness.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "glance" }>;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();
</script>

<template>
  <section class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <Freshness :freshness="module.data.freshness" />
    </div>
    <p v-if="module.data.latest" class="glance-latest">
      {{ module.data.latest.text }}
      <span class="m">{{ module.data.latest.relative }} ago</span>
    </p>
    <p class="glance-stats m">
      <span v-for="(s, i) in module.data.stats" :key="i">
        {{ s.value }}<small v-if="s.unit">{{ s.unit }}</small> {{ s.label }}
      </span>
      <button class="more" @click="() => { trackClick('more'); go('code'); }">full activity →</button>
    </p>
  </section>
</template>
