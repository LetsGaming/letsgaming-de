<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import ModuleSection from "../ui/ModuleSection.vue";
import PresenceWidget from "../presence/PresenceWidget.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "presence" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note">
    <div>
      <PresenceWidget
        :enabled="module.data.enabled"
        :name="module.data.name"
        :handle="module.data.handle"
        :avatar="module.data.avatar"
      />
    </div>
  </ModuleSection>
</template>
