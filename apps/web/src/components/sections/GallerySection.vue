<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import ModuleSection from "../ui/ModuleSection.vue";
import AssetPicture from "../ui/AssetPicture.vue";

const { t } = useT();
defineProps<{
  module: Extract<ResolvedModule, { kind: "gallery" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note">
    <div v-if="module.data.images.length" class="gal">
      <figure v-for="img in module.data.images" :key="img.id" class="gal-item">
        <AssetPicture :view="img.image" />
        <figcaption v-if="img.caption">{{ img.caption }}</figcaption>
      </figure>
    </div>
    <p v-else class="sub">{{ t("emptyGallery") }}</p>
  </ModuleSection>
</template>

<style scoped>
/* Gallery-specific rules, scoped so they can't leak or be out-specified. The
 * shell is ModuleSection; `.sub` (the empty-state caption) stays global. */
.gal {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--sp-12);
}
.gal-item {
  margin: 0;
  background: var(--surf-1);
  border: 1px solid var(--line-1);
  border-radius: 14px;
  overflow: hidden;
}
.gal-item :deep(img) {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.gal-item figcaption {
  padding: var(--sp-8) var(--sp-12);
  font-size: 13px;
  color: var(--muted);
}
</style>
