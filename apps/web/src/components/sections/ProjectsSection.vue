<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import { langColor, icons } from "../../lib/icons";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import Freshness from "../ui/Freshness.vue";
import { trackClick, trackProject } from "../../lib/track";

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
      <SmartLink
        v-for="p in module.data.projects"
        :key="p.id"
        class="card"
        :class="{ feature: p.featured }"
        :href="p.href"
        @click="() => { trackClick('project'); trackProject(p.name); }"
      >
        <div class="ptitle">{{ p.name }}<span class="arrow" v-html="icons.arrow" /></div>
        <span class="tag" :style="{ color: langColor(p.tag), borderColor: langColor(p.tag) }">{{ p.tag }}</span>
        <p class="desc">{{ p.description }}</p>
        <div class="meta"><span v-for="(m, i) in p.meta" :key="i">{{ m }}</span></div>
      </SmartLink>
    </div>
  </ModuleSection>
</template>
