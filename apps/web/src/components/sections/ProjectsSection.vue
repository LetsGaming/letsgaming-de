<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import ProjectCard from "../ui/ProjectCard.vue";
import Freshness from "../ui/Freshness.vue";
import { trackClick } from "../../lib/track";

const { t } = useT();
defineProps<{
  module: Extract<ResolvedModule, { kind: "projects" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note>
      <Freshness :freshness="module.data.freshness" />
      <SmartLink
        v-if="module.data.githubUrl"
        class="more"
        :href="module.data.githubUrl"
        @click="trackClick('github-profile')"
      >{{ t("allReposGitHub") }}</SmartLink>
    </template>
    <div class="grid">
      <p v-if="!module.data.projects.length" class="sub">{{ t("emptyProjects") }}</p>
      <ProjectCard
        v-for="p in module.data.projects"
        :key="p.id"
        :project="p"
        event="project"
      />
    </div>
  </ModuleSection>
</template>
