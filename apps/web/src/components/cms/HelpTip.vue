<script setup lang="ts">
/** A "?" that carries the implementation detail a setting's one-line help leaves out. */
defineProps<{ text: string }>();
</script>

<template>
  <button type="button" class="helptip" :title="text" :aria-label="`More: ${text}`">?</button>
</template>

<style scoped>
.helptip {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-left: var(--sp-6);
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--card-2);
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: help;
  vertical-align: middle;
}
.helptip:hover,
.helptip:focus-visible {
  color: var(--ink);
  border-color: var(--muted);
}
</style>
