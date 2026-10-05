<script setup lang="ts">
/**
 * A compact grid of previews, one per area, each a real link into it. The data is
 * resolved with the rest of the view, so this renders on first paint like any
 * other module.
 */
import type { ResolvedModule } from "@lg/core";
import { trackClick } from "../../lib/track";
import ModuleSection from "../ui/ModuleSection.vue";
import SmartLink from "../ui/SmartLink.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "teasers" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note">
    <div class="teasers">
      <SmartLink
        v-for="c in module.data.teasers"
        :key="c.id"
        class="teaser"
        :href="c.href"
        @click="trackClick('teaser')"
      >
        <span class="teaser__label">{{ c.label }}</span>
        <span class="teaser__value">{{ c.value }}</span>
        <span v-if="c.detail" class="teaser__detail">{{ c.detail }}</span>
      </SmartLink>
    </div>
  </ModuleSection>
</template>

<style scoped>
.teasers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--sp-12);
}
.teaser {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-14) var(--sp-16);
  border: 1px solid var(--line-1);
  border-radius: 12px;
  color: inherit;
  text-decoration: none;
  min-width: 0;
}
.teaser:hover,
.teaser:focus-visible {
  border-color: var(--line-2);
}
.teaser__label {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.teaser__value {
  color: var(--ink-strong);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.teaser__detail {
  font-size: var(--fs-meta);
  color: var(--muted);
}
</style>
