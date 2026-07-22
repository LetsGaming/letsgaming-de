<script setup lang="ts">
/**
 * The row of headline stats a module opens with. Holds `StatTile`s; the only
 * thing that varies is how many fit across, so that's the prop.
 *
 * Activity and Glance each wrote their own grid against a global class — Activity
 * against `.stats` (four up), Glance against `.dash`, which is really the
 * two-card dashboard row and only coincidentally two columns wide. Naming the
 * column count makes each section's intent explicit and stops the two meanings of
 * `.dash` from being load-bearing.
 */
interface Props {
  /** Columns at full width. Collapses to two on narrow viewports either way. */
  columns?: 2 | 3 | 4;
}
withDefaults(defineProps<Props>(), { columns: 4 });
</script>

<template>
  <div class="statgrid" :class="`statgrid--${columns}`">
    <slot />
  </div>
</template>

<style scoped>
.statgrid {
  display: grid;
  gap: var(--sp-14);
}
.statgrid--2 {
  grid-template-columns: repeat(2, 1fr);
}
.statgrid--3 {
  grid-template-columns: repeat(3, 1fr);
}
.statgrid--4 {
  grid-template-columns: repeat(4, 1fr);
}

/* Same breakpoint the global `.stats` used, so nothing reflows differently. */
@media (max-width: 680px) {
  .statgrid--3,
  .statgrid--4 {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
