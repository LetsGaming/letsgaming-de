<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import GuestbookForm from "../GuestbookForm.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "guestbook" }>;
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
    <div v-if="module.data.entries.length" class="gb-list">
      <figure v-for="e in module.data.entries" :key="e.id" class="gb-entry">
        <blockquote>{{ e.message }}</blockquote>
        <figcaption>— {{ e.name }} <span class="tm">{{ e.relative }}</span></figcaption>
      </figure>
    </div>
    <p v-else class="gb-empty">No notes yet — be the first to sign.</p>
    <div><GuestbookForm /></div>
  </section>
</template>
