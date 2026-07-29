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
/* A ledger, not a card.
 *
 * These rows already drew their own hairlines *inside* a ModuleCard, which is the
 * tell that the card was redundant: strip the border and the grouping is still
 * obvious, so the container was only adding weight. It also made this the fourth
 * consecutive bordered box on /life, where the one section that isn't a box
 * (hobbies) is the one that reads best.
 *
 * What's left is the escalation ladder's second rung — alignment plus a rule — for
 * content that is genuinely a list of key/value pairs. The mono keys were already
 * pulling in a ledger direction; this lets them.
 *
 * The `b` inside `.v` comes from v-html, so it needs :deep() to be reached. */
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
/* The bottom rule closes the list. Inside a card the border did that; now the
   section has to say where it ends itself. */
.nowledger {
  border-bottom: 1px solid var(--line-1);
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
