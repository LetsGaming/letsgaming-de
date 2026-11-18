<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import { mdBold } from "../../lib/text";
import ModuleSection from "../ui/ModuleSection.vue";

const { t } = useT();
defineProps<{
  module: Extract<ResolvedModule, { kind: "now" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note">
    <p v-if="!module.data.items.length" class="sub">{{ t("emptyNow") }}</p>
    <div v-else class="nowledger">
      <div v-for="n in module.data.items" :key="n.id" class="nowrow">
        <span class="k">{{ n.key }}</span>
        <span class="v" v-html="mdBold(n.value)" />
      </div>
    </div>
  </ModuleSection>
</template>

<style scoped>
/* A key and value list: alignment plus a rule, no container. The bottom rule closes
   the list. The `b` inside `.v` comes from v-html, so it needs :deep() to be reached. */
.nowledger {
  border-bottom: 1px solid var(--line-1);
}
.nowrow {
  display: grid;
  grid-template-columns: minmax(5.5rem, 8rem) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: baseline;
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line-1);
}
.nowrow .k {
  font-size: var(--fs-small);
  color: var(--muted);
}
.nowrow .v {
  font-size: var(--fs-body);
  color: var(--ink);
}
.nowrow .v :deep(b) {
  color: var(--ink-strong);
  font-weight: 600;
}
</style>
