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
/* The first image spans two columns once there are three or more to a row; the rest
   fill a regular grid. Captions sit under the frame, never over it. */
.gal {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5) var(--space-4);
}
@container (min-width: 720px) {
  .gal {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gal-item:first-child {
    grid-column: span 2;
  }
}
.gal-item {
  margin: 0;
  min-width: 0;
}
.gal-item :deep(img) {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--r-2);
  background: var(--surf-2);
}
.gal-item:first-child :deep(img) {
  aspect-ratio: 16 / 9;
}
.gal-item figcaption {
  padding-top: var(--space-2);
  font-size: var(--fs-meta);
  color: var(--muted);
}
@container (max-width: 719px) {
  .gal-item:first-child {
    grid-column: 1 / -1;
  }
}
</style>
