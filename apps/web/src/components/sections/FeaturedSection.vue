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
      <SmartLink class="more" :href="module.data.moreHref" @click="() => trackClick('more')">{{ t("seeAllWork") }}</SmartLink>
    </template>
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
