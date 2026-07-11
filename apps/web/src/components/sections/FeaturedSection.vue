<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import { trackClick, trackProject } from "../../lib/track";

defineProps<{
  module: Extract<ResolvedModule, { kind: "featured" }>;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();
</script>

<template>
  <section class="sec rise">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <button class="more" @click="() => { trackClick('more'); go('work'); }">see all my work →</button>
    </div>
    <div class="grid">
      <a
        v-if="module.data.project"
        class="card feature"
        :href="module.data.project.href"
        @click="() => { trackClick('featured'); trackProject(module.data.project.name); }"
      >
        <div class="ptitle">
          {{ module.data.project.name }}<span class="arrow" v-html="icons.arrow" />
        </div>
        <span class="tag">{{ module.data.project.tag }}</span>
        <p class="desc">{{ module.data.project.description }}</p>
        <div class="meta">
          <span v-for="(m, i) in module.data.project.meta" :key="i">{{ m }}</span>
        </div>
      </a>
    </div>
  </section>
</template>
