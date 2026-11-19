<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { useT } from "~/composables/useT";
import { trackClick } from "../../lib/track";
import ModuleSection from "../ui/ModuleSection.vue";
import Freshness from "../ui/Freshness.vue";
import EventRow from "../ui/EventRow.vue";
import SmartLink from "../ui/SmartLink.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "recent" }>;
}>();

const { t } = useT();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note>
      <span v-if="module.data.note" class="note">{{ module.data.note }}</span>
      <Freshness :freshness="module.data.freshness" />
      <SmartLink class="more" :href="module.data.moreHref" @click="() => trackClick('recent-more')">{{ t("fullActivity") }}</SmartLink>
    </template>
    <ul v-if="module.data.events.length" class="feed">
      <li v-for="(e, i) in module.data.events" :key="i">
        <EventRow :event="e" />
      </li>
    </ul>
  </ModuleSection>
</template>

<style scoped>
.note {
  font-family: var(--f-b);
  font-size: var(--fs-meta);
  color: var(--muted);
}
.feed {
  max-width: 48rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
