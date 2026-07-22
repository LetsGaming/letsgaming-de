<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import { trackClick } from "../../lib/track";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import Freshness from "../ui/Freshness.vue";
import StatGrid from "../ui/StatGrid.vue";
import StatTile from "../ui/StatTile.vue";

const { t } = useT();
defineProps<{
  module: Extract<ResolvedModule, { kind: "glance" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note><Freshness :freshness="module.data.freshness" /></template>
    <p v-if="module.data.latest" class="glance-latest">
      {{ module.data.latest.text }}
      <span class="m">{{ t("ago", { age: module.data.latest.relative }) }}</span>
    </p>
    <StatGrid :columns="2" class="glance-stats">
      <StatTile
        v-for="(s, i) in module.data.stats"
        :key="i"
        size="lead"
        :value="s.value"
        :unit="s.unit"
        :label="s.label"
      />
    </StatGrid>
    <SmartLink class="more glance-more" :href="module.data.moreHref" @click="() => trackClick('more')">{{ t("fullActivity") }}</SmartLink>
  </ModuleSection>
</template>

<style scoped>
/* Glance's unique bits. The stat row is StatGrid + StatTile (shared with
 * Activity); `.more` stays global. */
.glance-latest {
  font-size: var(--fs-body);
  margin-bottom: var(--sp-6);
}
.glance-latest .m {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
}
.glance-stats {
  margin-top: var(--sp-18);
}
.glance-more {
  margin-top: var(--sp-12);
}
</style>
