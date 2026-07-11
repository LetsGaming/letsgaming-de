<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { langColor } from "../../lib/icons";

defineProps<{
  module: Extract<ResolvedModule, { kind: "coding" }>;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();
</script>

<template>
  <section class="sec">
    <div class="sec-head rise">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div v-if="module.data.coding" class="box rise">
      <div class="sub">{{ module.data.coding.range }} · {{ module.data.coding.totalHours }}h tracked</div>
      <div class="lang">
        <div v-for="l in module.data.coding.languages" :key="l.name" class="row">
          <span class="nm">{{ l.name }}</span>
          <div class="bar"><b :style="{ width: l.pct + '%', background: langColor(l.name) }" /></div>
          <span class="pc">{{ l.pct }}%</span>
        </div>
      </div>
    </div>
    <p v-else class="sub rise">No coding time synced yet.</p>
  </section>
</template>
