<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import AssetPicture from "../ui/AssetPicture.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "gallery" }>;
}>();
</script>

<template>
  <section :id="module.id" class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div v-if="module.data.images.length" class="gal">
      <figure v-for="img in module.data.images" :key="img.id" class="gal-item">
        <AssetPicture :view="img.image" />
        <figcaption v-if="img.caption">{{ img.caption }}</figcaption>
      </figure>
    </div>
    <p v-else class="sub">No pictures yet.</p>
  </section>
</template>

<style scoped>
/* Gallery-specific rules, scoped so they can't leak or be out-specified. The
 * shared primitives (.sec, .sec-head, .sub) stay global — they're layout the
 * whole site shares, not this section's. */
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
