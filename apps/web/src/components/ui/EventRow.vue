<script setup lang="ts">
import type { EventView } from "@lg/core";
import { icons } from "../../lib/icons";
import SmartLink from "./SmartLink.vue";

defineProps<{ event: EventView }>();
</script>

<template>
  <SmartLink :href="event.href" as="div" class="ev" :class="{ 'ev-link': event.href }">
    <span class="tm">{{ event.relative }}</span>
    <span class="ev-body">
      <span class="ei" v-html="icons[event.type]" />
      <span class="ev-text">
        <span class="et">{{ event.text }}</span>
        <span v-if="event.meta" class="em">{{ event.meta }}</span>
      </span>
    </span>
  </SmartLink>
</template>

<style scoped>
.ev {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  gap: var(--space-4);
  align-items: baseline;
  padding: var(--space-2) 0;
  color: inherit;
  text-decoration: none;
}
.tm {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.ev-body {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
  min-width: 0;
}
.ei {
  flex: none;
  display: inline-grid;
  place-items: center;
  align-self: center;
}
.ei :deep(svg) {
  width: 1rem;
  height: 1rem;
  color: var(--muted);
}
.ev-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.et {
  font-size: var(--fs-small);
  color: var(--ink);
  overflow-wrap: anywhere;
}
.em {
  font-family: var(--f-b);
  font-size: var(--fs-meta);
  color: var(--muted);
}
a.ev-link:hover .et,
a.ev-link:focus-visible .et {
  color: var(--ink-strong);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
</style>
