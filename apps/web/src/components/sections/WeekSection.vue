<script setup lang="ts">
import { computed } from "vue";
import type { ClickAction, ResolvedModule, WeekPart } from "@lg/core";
import { trackClick } from "../../lib/track";
import ModuleSection from "../ui/ModuleSection.vue";
import SmartLink from "../ui/SmartLink.vue";
import Freshness from "../ui/Freshness.vue";

const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "week" }>;
}>();

const split = computed(() => {
  const parts = props.module.data.parts;
  const at = parts.findIndex((p) => p.role === "event");
  return at < 0 ? { lead: parts, tail: [] as WeekPart[] } : { lead: parts.slice(0, at), tail: parts.slice(at) };
});

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
  <ModuleSection :id="module.id" :heading="module.data.heading" gap="tight">
    <template #note>
      <span v-if="module.data.note" class="note">{{ module.data.note }}</span>
      <Freshness :freshness="module.data.freshness" />
    </template>
    <p v-if="split.lead.length" class="week">
      <template v-for="(p, i) in split.lead" :key="i">
        <SmartLink v-if="p.href" class="week-link" :href="p.href" @click="track(p.role)">{{ p.text }}</SmartLink>
        <template v-else>{{ p.text }}</template>
      </template>
    </p>
    <p v-if="split.tail.length" class="week-tail" :class="{ alone: !split.lead.length }">
      <template v-for="(p, i) in split.tail" :key="i">
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
  text-wrap: pretty;
  overflow-wrap: break-word;
  hyphens: auto;
}
.week-tail {
  max-width: 40ch;
  margin: var(--space-3) 0 0;
  font-size: var(--fs-h3);
  line-height: 1.4;
  color: var(--ink);
}
.week-tail.alone {
  margin-top: 0;
  font-size: var(--fs-h2);
  font-family: var(--f-d);
  font-weight: 600;
}
@container (min-width: 560px) {
  .week-tail .week-link {
    white-space: nowrap;
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
