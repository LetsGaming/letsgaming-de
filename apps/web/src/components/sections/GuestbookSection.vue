<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import ModuleSection from "../ui/ModuleSection.vue";
import GuestbookForm from "../forms/GuestbookForm.vue";

const { t } = useT();

defineProps<{
  module: Extract<ResolvedModule, { kind: "guestbook" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note">
    <div v-if="module.data.entries.length" class="gb-list">
      <figure v-for="e in module.data.entries" :key="e.id" class="gb-entry">
        <blockquote>{{ e.message }}</blockquote>
        <figcaption>— {{ e.name }} <span class="tm">{{ e.relative }}</span></figcaption>
      </figure>
    </div>
    <p v-else class="gb-empty">{{ t("emptyGuestbook") }}</p>
    <div><GuestbookForm /></div>
  </ModuleSection>
</template>

<style scoped>
/* Guestbook entries, scoped. `.tm` stays global but is styled here as a descendant
 * of the entry's figcaption — it's a real element in this template, so no :deep
 * needed. The GuestbookForm child brings its own styles. */
.gb-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--sp-14);
  margin-bottom: var(--sp-6);
}
.gb-entry {
  background: var(--surf-1);
  border: 1px solid var(--line-1);
  border-radius: 14px;
  padding: var(--sp-16) var(--sp-18);
  margin: 0;
}
.gb-entry blockquote {
  margin: 0 0 var(--sp-10);
  color: var(--ink);
  font-size: var(--fs-body);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.gb-entry figcaption {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--ink-strong);
  display: flex;
  align-items: baseline;
  gap: var(--sp-8);
}
.gb-entry figcaption .tm {
  color: var(--muted);
  margin-left: auto;
}
.gb-empty {
  color: var(--muted);
  margin-bottom: var(--sp-6);
}
</style>
