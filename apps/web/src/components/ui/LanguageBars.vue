<script setup lang="ts">
/**
 * A stack of language bars: name · a proportional bar coloured by the language ·
 * percentage. Shared by the coding module (Wakapi time by language) and the
 * activity module (GitHub linguist) — both rendered exactly this, off the same
 * `langColor`. Purely presentational; the caller passes the ranked languages.
 */
import { langColor } from "../../lib/icons";

defineProps<{ languages: { name: string; pct: number }[] }>();
</script>

<template>
  <div class="lang">
    <div v-for="l in languages" :key="l.name" class="row">
      <span class="nm">{{ l.name }}</span>
      <div class="bar"><b :style="{ width: l.pct + '%', background: langColor(l.name) }" /></div>
      <span class="pc">{{ l.pct }}%</span>
    </div>
  </div>
</template>

<style scoped>
.lang {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.row {
  display: flex;
  align-items: center;
  gap: 9px;
}
.nm {
  font-size: 12px;
  color: var(--ink);
  width: 88px;
  font-family: var(--f-m);
}
.bar {
  flex: 1;
  height: 8px;
  border-radius: 5px;
  background: var(--track);
  overflow: hidden;
}
.bar b {
  display: block;
  height: 100%;
  border-radius: 5px;
}
.pc {
  font-family: var(--f-m);
  font-size: 11px;
  color: var(--muted);
  width: 34px;
  text-align: right;
}
</style>
