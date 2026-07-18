<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { mdBold } from "../../lib/text";

defineProps<{
  module: Extract<ResolvedModule, { kind: "now" }>;
}>();
</script>

<template>
  <section :id="module.id" class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div class="box">
      <p v-if="!module.data.items.length" class="sub">Nothing written here lately.</p>
      <div v-for="n in module.data.items" :key="n.id" class="nowrow">
        <span class="k">{{ n.key }}</span>
        <span class="v" v-html="mdBold(n.value)" />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Now-specific rows. `.box` stays global (Coding and Activity share it). The `b`
 * inside `.v` comes from v-html, so it needs :deep() to be reached. */
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
  font-size: 11px;
  color: var(--muted);
  width: 74px;
  flex-shrink: 0;
}
.nowrow .v {
  font-size: 15px;
  color: var(--ink);
}
.nowrow .v :deep(b) {
  color: var(--ink-strong);
  font-weight: 600;
}
</style>
