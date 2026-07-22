<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import { trackClick } from "../../lib/track";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import Freshness from "../ui/Freshness.vue";

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
      <span class="m">{{ module.data.latest.relative }} ago</span>
    </p>
    <div class="dash">
      <div v-for="(s, i) in module.data.stats" :key="i" class="stat">
        <span class="n">{{ s.value }}<small v-if="s.unit">{{ s.unit }}</small></span>
        <span class="l">{{ s.label }}</span>
      </div>
    </div>
    <SmartLink class="more glance-more" :href="module.data.moreHref" @click="() => trackClick('more')">{{ t("fullActivity") }}</SmartLink>
  </ModuleSection>
</template>

<style scoped>
/* Glance's unique bits. The dashboard primitives (.dash, .stat, .n, .l, .more)
 * stay global — Activity shares them. `.glance-stats` was a dead half of a
 * combined selector (no element uses it) and is dropped. */
.glance-latest {
  font-size: var(--fs-body);
  margin-bottom: var(--sp-6);
}
.glance-latest .m {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
}
.glance-more {
  margin-top: var(--sp-12);
}
</style>
