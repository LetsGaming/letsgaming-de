<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import PresenceWidget from "../presence/PresenceWidget.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "presence" }>;
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
        :enabled="module.data.enabled"
        :name="module.data.name"
        :handle="module.data.handle"
        :avatar="module.data.avatar"
      />
    </div>
  </section>
</template>
