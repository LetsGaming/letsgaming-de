<script setup lang="ts">
import { AREA } from "@lg/core";
import type { ResolvedModule } from "@lg/core";
import { trackClick } from "../../lib/track";
import Freshness from "../Freshness.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "glance" }>;
  go: (id: string) => void;
}>();
</script>

<template>
  <section :id="module.id" class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <Freshness :freshness="module.data.freshness" />
    </div>
    <p v-if="module.data.latest" class="glance-latest">
      {{ module.data.latest.text }}
      <span class="m">{{ module.data.latest.relative }} ago</span>
    </p>
    <div class="dash">
      <div v-for="(s, i) in module.data.stats" :key="i" class="stat">
        <span class="n">{{ s.value }}<small v-if="s.unit">{{ s.unit }}</small></span>
        <span class="l">{{ s.label }}</span>
      </div>
    </div>
    <button class="more glance-more" @click="() => { trackClick('more'); go(AREA.code); }">
      full activity →
    </button>
  </section>
</template>
