<script setup lang="ts">
import type { ClickAction, ResolvedModule, WeekPart } from "@lg/core";
import { trackClick } from "../../lib/track";
import ModuleSection from "../ui/ModuleSection.vue";
import SmartLink from "../ui/SmartLink.vue";
import Freshness from "../ui/Freshness.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "week" }>;
}>();

const ACTION_BY_ROLE: Record<NonNullable<WeekPart["role"]>, ClickAction> = {
  code: "week-code",
  games: "week-games",
  event: "week-event",
};
const track = (role: WeekPart["role"]) => {
  if (role) trackClick(ACTION_BY_ROLE[role]);
};
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note>
      <span v-if="module.data.note" class="note">{{ module.data.note }}</span>
      <Freshness :freshness="module.data.freshness" />
    </template>
    <p class="week">
      <template v-for="(p, i) in module.data.parts" :key="i">
        <SmartLink v-if="p.href" class="week-link" :href="p.href" @click="track(p.role)">{{ p.text }}</SmartLink>
        <template v-else>{{ p.text }}</template>
      </template>
    </p>
  </ModuleSection>
</template>

<style scoped>
.note {
  font-family: var(--f-b);
  font-size: var(--fs-meta);
  color: var(--muted);
}
.week {
  max-width: 40ch;
  margin: 0;
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h2);
  line-height: 1.4;
  color: var(--ink);
  overflow-wrap: break-word;
  hyphens: auto;
}
@container (min-width: 720px) {
  .week {
    font-size: var(--fs-h1);
    line-height: 1.3;
  }
}
.week-link {
  color: var(--ink-strong);
  text-decoration: underline;
  text-decoration-thickness: 0.06em;
  text-underline-offset: 0.18em;
}
.week-link:hover,
.week-link:focus-visible {
  text-decoration-thickness: 0.12em;
}
</style>
