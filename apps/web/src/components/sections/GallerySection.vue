<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import AssetPicture from "../AssetPicture.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "gallery" }>;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();
</script>

<template>
  <section class="sec">
    <div class="sec-head rise">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div v-if="module.data.images.length" class="gal rise">
      <figure v-for="img in module.data.images" :key="img.id" class="gal-item">
        <AssetPicture :view="img.image" />
        <figcaption v-if="img.caption">{{ img.caption }}</figcaption>
      </figure>
    </div>
    <p v-else class="sub rise">No pictures yet.</p>
  </section>
</template>
