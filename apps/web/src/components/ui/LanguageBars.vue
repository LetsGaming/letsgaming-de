<script setup lang="ts">
/**
 * A stack of language bars: name · a proportional bar coloured by the language ·
 * percentage. Shared by the coding module (Wakapi time by language) and the
 * activity module (GitHub linguist) — both rendered exactly this, off the same
 * `langColor`. Purely presentational; the caller passes the ranked languages.
 *
 * Name and colour both go through the lookup rather than the source's own string,
 * so the two modules agree on spelling as well as hue. Wakapi's `Typescript` and
 * linguist's `TypeScript` are the same language and now render as the same word.
 */
import { langColor, langName } from "../../lib/icons";

defineProps<{ languages: { name: string; pct: number }[] }>();
</script>

<template>
  <div class="lang">
    <div v-for="l in languages" :key="l.name" class="row">
      <span class="nm">{{ langName(l.name) }}</span>
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
  font-size: var(--fs-meta);
  color: var(--ink);
  width: 88px;
  font-family: var(--f-m);
}
.bar {
  flex: 1;
  height: 8px;
  /* --r-pill clamps to half the 8px height (4px) either way — same rendered
   * shape as the hardcoded 5px this replaced, since border-radius can't exceed
   * half a box's own dimension. Using the token instead of a magic number that
   * was already being silently clamped by the browser. */
  border-radius: var(--r-pill);
  background: var(--track);
  overflow: hidden;
}
.bar b {
  display: block;
  height: 100%;
  border-radius: var(--r-pill);
}
.pc {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  width: 34px;
  text-align: right;
}
</style>
