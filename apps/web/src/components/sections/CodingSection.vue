<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { langColor } from "../../lib/icons";
import Freshness from "../Freshness.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "coding" }>;
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
    <div v-if="module.data.coding" class="box">
      <div class="sub">{{ module.data.coding.range }} · {{ module.data.coding.totalHours }}h tracked</div>
      <div class="lang">
        <div v-for="l in module.data.coding.languages" :key="l.name" class="row">
          <span class="nm">{{ l.name }}</span>
          <div class="bar"><b :style="{ width: l.pct + '%', background: langColor(l.name) }" /></div>
          <span class="pc">{{ l.pct }}%</span>
        </div>
      </div>
    </div>
    <p v-else class="sub">No coding time synced yet.</p>
  </section>
</template>
