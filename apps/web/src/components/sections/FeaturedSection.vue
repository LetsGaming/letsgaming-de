<script setup lang="ts">
import { useT } from "~/composables/useT";
import { computed } from "vue";
import type { ResolvedModule } from "@lg/core";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import ProjectCard from "../ui/ProjectCard.vue";
import Freshness from "../ui/Freshness.vue";
import { trackClick } from "../../lib/track";

const { t } = useT();
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
      <SmartLink class="more" :href="module.data.moreHref" @click="() => trackClick('project-more')">{{ t("seeAllWork") }}</SmartLink>
    </template>
    <p v-if="project" class="picked">{{ t(project.featured ? "featuredPinned" : "featuredLatest") }}</p>
    <div class="grid">
      <ProjectCard
        v-if="project"
        :project="project"
        feature
        event="featured"
      />
      <p v-else class="sub">{{ t("emptyFeatured") }}</p>
    </div>
  </ModuleSection>
</template>

<style scoped>
/* Same typographic convention used for every other small "here's the fact"
 * caption this session (the hero's synced line, Freshness): mono + micro +
 * muted, so a visitor reads it as a fact, not a new decoration. Without this,
 * the single card reads as an arbitrary editorial choice rather than either a
 * deliberate pin or an honest "here's what's newest" fallback. */
.picked {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  margin-bottom: var(--sp-8);
}
</style>
