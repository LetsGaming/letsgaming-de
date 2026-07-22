<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import { mdBold } from "../../lib/text";
import ModuleSection from "../ui/ModuleSection.vue";
import ModuleCard from "../ui/ModuleCard.vue";

const { t } = useT();
defineProps<{
  module: Extract<ResolvedModule, { kind: "now" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note">
    <ModuleCard>
      <p v-if="!module.data.items.length" class="sub">{{ t("emptyNow") }}</p>
      <div v-for="n in module.data.items" :key="n.id" class="nowrow">
        <span class="k">{{ n.key }}</span>
        <span class="v" v-html="mdBold(n.value)" />
      </div>
    </ModuleCard>
  </ModuleSection>
</template>

<style scoped>
/* Now-specific rows; the card surface is ModuleCard. The `b` inside `.v` comes
 * from v-html, so it needs :deep() to be reached. */
.nowrow {
  display: flex;
  gap: var(--sp-14);
  align-items: center;
  padding: var(--sp-12) 0;
  border-top: 1px solid var(--line-1);
}
.nowrow:first-child {
  border-top: none;
}
.nowrow .k {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  width: 74px;
  flex-shrink: 0;
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
