<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import ModuleSection from "../ui/ModuleSection.vue";
import GuestbookForm from "../forms/GuestbookForm.vue";
import ListFooter from "../ui/ListFooter.vue";
import { useLimitedList } from "~/composables/useLimitedList";

const { t } = useT();

const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "guestbook" }>;
}>();

// The API caps approved entries at 100, which is still a wall on a homepage. The
// same useLimitedList/ListFooter pair as the activity modules collapses it small
// and expands to what is on hand. `max` is the fetched length: there is no
// further server page beyond the 100-entry fetch.
const { shown, expanded, moreCount } = useLimitedList({
  rows: () => props.module.data.entries,
  initial: 6,
  max: () => props.module.data.entries.length,
});
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note" gap="group">
    <div class="gb-layout" :class="{ 'gb-layout--split': module.data.entries.length }">
      <div class="gb-entries">
        <template v-if="module.data.entries.length">
          <div class="gb-list">
            <figure v-for="e in shown" :key="e.id" class="gb-entry">
              <blockquote>{{ e.message }}</blockquote>
              <figcaption>{{ e.name }} <span class="tm">{{ e.relative }}</span></figcaption>
            </figure>
          </div>
          <ListFooter :more-count="moreCount" :expanded="expanded" @toggle="expanded = !expanded" />
        </template>
        <p v-else class="gb-empty">{{ t("emptyGuestbook") }}</p>
      </div>
      <div class="gb-form"><GuestbookForm /></div>
    </div>
  </ModuleSection>
</template>

<style scoped>
/* Entries left, form right once the module (a size container, see ModuleSection)
 * is wide enough; stacked below that. */
.gb-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-7);
  align-items: start;
}
@container (min-width: 720px) {
  .gb-layout--split {
    grid-template-columns: minmax(0, 1fr) minmax(240px, 280px);
    gap: var(--space-8);
  }
  .gb-layout--split .gb-form {
    position: sticky;
    top: var(--space-4);
  }
}
.gb-form {
  font-size: var(--fs-small);
}
.gb-form :deep(.gform-wrap) {
  margin-top: 0;
}
.gb-list {
  display: grid;
  gap: var(--space-6);
  max-width: 46ch;
  margin-bottom: var(--space-4);
}
.gb-entry {
  margin: 0;
}
.gb-entry blockquote {
  margin: 0 0 var(--space-2);
  color: var(--ink-strong);
  font-family: var(--f-d);
  font-size: var(--fs-h3);
  font-weight: 500;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
}
.gb-entry figcaption {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  font-size: var(--fs-small);
  color: var(--muted);
}
.gb-entry figcaption .tm {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  font-weight: 400;
  color: var(--muted);
}
.gb-empty {
  color: var(--muted);
  margin-bottom: var(--space-3);
}
</style>
