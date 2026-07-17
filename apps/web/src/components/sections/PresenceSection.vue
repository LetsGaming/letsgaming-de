<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import PresenceWidget from "../PresenceWidget.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "presence" }>;
  go: (id: string) => void;
}>();
</script>

<template>
  <section :id="module.id" class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div>
      <PresenceWidget
        :live="module.data.live"
        :name="module.data.name"
        :handle="module.data.handle"
        :avatar="module.data.avatar"
        :steam="module.data.steam"
      />
    </div>
  </section>
</template>
