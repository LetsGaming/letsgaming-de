<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import ModuleSection from "../ui/ModuleSection.vue";
import { icons } from "../../lib/icons";

const { t } = useT();

defineProps<{
  module: Extract<ResolvedModule, { kind: "hobbies" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note">
    <p v-if="!module.data.hobbies.length" class="sub">{{ t("nothingHere") }}</p>
    <ul v-else class="hobbies">
      <li v-for="h in module.data.hobbies" :key="h.id" class="hobby">
        <span class="ic" aria-hidden="true" v-html="h.icon ? icons[h.icon] : ''" />
        <div class="hobby-text">
          <h3>{{ h.title }}</h3>
          <p>{{ h.blurb }}</p>
        </div>
      </li>
    </ul>
  </ModuleSection>
</template>

<style scoped>
.hobbies {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  column-gap: var(--space-6);
  margin: 0;
  padding: 0;
  list-style: none;
}
@container (min-width: 560px) {
  .hobbies {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.hobby {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line-1);
  min-width: 0;
}
.ic {
  flex: none;
  display: grid;
  place-items: center;
  width: var(--space-6);
  height: var(--space-6);
  color: var(--ink);
}
/* The svg comes from v-html (h.icon), so it needs :deep() to be reached. */
.ic :deep(svg) {
  width: var(--space-5);
  height: var(--space-5);
}
.hobby-text {
  min-width: 0;
}
.hobby h3 {
  font-family: var(--f-b);
  font-weight: 600;
  font-size: var(--fs-body);
  color: var(--ink-strong);
}
.hobby p {
  font-size: var(--fs-small);
  color: var(--muted);
  margin-top: var(--space-1);
}
</style>
