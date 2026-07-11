<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import { trackClick, trackProject } from "../../lib/track";

defineProps<{
  module: Extract<ResolvedModule, { kind: "projects" }>;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();
</script>

<template>
  <section class="sec">
    <div class="sec-head rise">
      <h2>{{ module.data.heading }}</h2>
      <a
        v-if="module.data.githubUrl"
        class="more"
        :href="module.data.githubUrl"
        target="_blank"
        rel="noreferrer noopener"
        @click="trackClick('github-profile')"
      >all repos on GitHub →</a>
    </div>
    <div class="grid">
      <a
        v-for="p in module.data.projects"
        :key="p.id"
        class="card"
        :class="{ feature: p.featured }"
        :href="p.href"
        @click="() => { trackClick('project'); trackProject(p.name); }"
      >
        <div class="ptitle">{{ p.name }}<span class="arrow" v-html="icons.arrow" /></div>
        <span class="tag">{{ p.tag }}</span>
        <p class="desc">{{ p.description }}</p>
        <div class="meta"><span v-for="(m, i) in p.meta" :key="i">{{ m }}</span></div>
      </a>
    </div>
  </section>
</template>
