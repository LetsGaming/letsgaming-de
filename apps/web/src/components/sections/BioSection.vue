<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { mdBold } from "../../lib/text";
import ModuleSection from "../ui/ModuleSection.vue";
import AssetPicture from "../ui/AssetPicture.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "bio" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note">
    <div class="prose">
      <template v-for="(b, i) in module.data.blocks" :key="i">
        <p v-if="b.kind === 'text'" v-html="mdBold(b.text)" />
        <figure v-else class="bio-img"><AssetPicture :view="b.image" /></figure>
      </template>
    </div>
  </ModuleSection>
</template>

<style scoped>
/* Text styling is the global `.prose`. The <img> is rendered by the AssetPicture
 * child, so it needs :deep(). */
.bio-img :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--r-3);
  border: 1px solid var(--line-1);
}
</style>
