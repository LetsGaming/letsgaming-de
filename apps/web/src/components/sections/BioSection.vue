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
/* Bio-specific styling, scoped. Two things need :deep() — the <img> is rendered
 * by the AssetPicture child, and the <p>/<b> come from v-html, which Vue does not
 * stamp with the scope attribute. Both would silently lose their styles without
 * it, which is the whole reason this extraction is done carefully per section. */
.prose {
  max-width: 600px;
  font-size: 16px;
  color: var(--ink);
}
.prose :deep(p) {
  margin-bottom: var(--sp-16);
}
.prose :deep(p:last-child) {
  margin-bottom: 0;
}
.prose :deep(b) {
  color: var(--ink-strong);
  font-weight: 600;
}
.bio-img {
  margin: var(--sp-18) 0;
}
.bio-img :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 14px;
  border: 1px solid var(--line-1);
}
</style>
