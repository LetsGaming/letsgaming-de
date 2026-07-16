<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";

defineProps<{
  module: Extract<ResolvedModule, { kind: "hobbies" }>;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();
</script>

<template>
  <section class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div class="hobbies">
      <p v-if="!module.data.hobbies.length" class="sub">Nothing here yet.</p>
      <div v-for="h in module.data.hobbies" :key="h.id" class="tile">
        <div>
          <div class="ic" v-html="h.icon ? icons[h.icon] : ''" />
          <h3>{{ h.title }}</h3>
          <p>{{ h.blurb }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
