<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { mdBold } from "../../lib/site";
import AssetPicture from "../AssetPicture.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "bio" }>;
  go: (id: string) => void;
}>();
</script>

<template>
  <section :id="module.id" class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div class="prose">
      <template v-for="(b, i) in module.data.blocks" :key="i">
        <p v-if="b.kind === 'text'" v-html="mdBold(b.text)" />
        <figure v-else class="bio-img"><AssetPicture :view="b.image" /></figure>
      </template>
    </div>
  </section>
</template>
