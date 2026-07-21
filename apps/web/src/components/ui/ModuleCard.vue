<script setup lang="ts">
/**
 * The card surface every titled module block sits on: one background, border,
 * radius, padding and (light-mode) shadow, matching the StatTile family. Replaces
 * three drifted copies — the global `.box` and the near-identical `.mu-card` /
 * `.pt-card` — that disagreed on padding and on whether they carried a shadow.
 *
 * It's only the surface. Compose a `CardHeader` and the content inside; a card can
 * hold a second `CardHeader` + content for a sub-section (Top games, Top songs).
 */
</script>

<template>
  <div class="module-card"><slot /></div>
</template>

<style scoped>
.module-card {
  background: var(--surf-1);
  border: 1px solid var(--line-1);
  border-radius: var(--r-card);
  padding: var(--sp-18);
  box-shadow: var(--sh-card);
}
</style>
