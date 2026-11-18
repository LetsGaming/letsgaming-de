<script setup lang="ts">
import { computed } from "vue";
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import ProjectCard from "../ui/ProjectCard.vue";
import Freshness from "../ui/Freshness.vue";
import { trackClick } from "../../lib/track";

const { t } = useT();
const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "projects" }>;
}>();

const rows = computed(() => {
  const all = props.module.data.projects;
  return [...all.filter((p) => p.featured), ...all.filter((p) => !p.featured)];
});
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" gap="group">
    <template #note>
      <Freshness :freshness="module.data.freshness" />
      <SmartLink
        v-if="module.data.githubUrl"
        class="more"
        :href="module.data.githubUrl"
        @click="trackClick('github-profile')"
      >{{ t("allReposGitHub") }}</SmartLink>
    </template>
    <p v-if="!rows.length" class="sub">{{ t("emptyProjects") }}</p>
    <div v-else class="ptable">
      <ProjectCard v-for="p in rows" :key="p.id" :project="p" event="project" />
    </div>
  </ModuleSection>
</template>

<style scoped>
.ptable {
  border-bottom: 1px solid var(--line-1);
}
</style>
