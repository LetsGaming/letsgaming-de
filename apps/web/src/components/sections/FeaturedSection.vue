<script setup lang="ts">
import { computed } from "vue";
import type { ResolvedModule } from "@lg/core";
import { langColor, icons } from "../../lib/icons";
import ModuleSection from "../ui/ModuleSection.vue";
import Freshness from "../ui/Freshness.vue";
import { trackClick, trackProject } from "../../lib/track";

const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "featured" }>;
}>();

/** Narrowed once here rather than in the template: a `v-if` on the element can't
 *  narrow inside that element's own event handler, which is how `project.name`
 *  stayed a latent null deref through every build. */
const project = computed(() => props.module.data.project);
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note>
      <Freshness :freshness="module.data.freshness" />
      <a class="more" :href="module.data.moreHref" @click="() => trackClick('more')">see all my work →</a>
    </template>
    <div class="grid">
      <a
        v-if="project"
        class="card feature"
        :href="project.href"
        @click="() => { trackClick('featured'); trackProject(project!.name); }"
      >
        <div class="ptitle">
          {{ project.name }}<span class="arrow" v-html="icons.arrow" />
        </div>
        <span class="tag" :style="{ color: langColor(project.tag), borderColor: langColor(project.tag) }">{{ project.tag }}</span>
        <p class="desc">{{ project.description }}</p>
        <div class="meta">
          <span v-for="(m, i) in project.meta" :key="i">{{ m }}</span>
        </div>
      </a>
      <p v-else class="sub">Nothing pinned right now.</p>
    </div>
  </ModuleSection>
</template>
