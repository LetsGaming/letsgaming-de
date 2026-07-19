<script lang="ts">
/**
 * Cell contract lives in a normal <script> block so it can be exported as a type
 * (`<script setup>` can't carry top-level exports).
 */
export interface HeatCell {
  /** Intensity bucket 0–4; 0 is the empty base and gets no `data-l`. */
  level: number;
  /** Tint this cell as "today/now" (`--heat-today`). */
  today?: boolean;
  /** Native tooltip for the cell. */
  title?: string;
}
</script>

<script setup lang="ts">
/**
 * A column-flow grid of intensity-bucketed cells — the shape GitHub's
 * contribution graph, the weekday×hour playtime heatmap, and (as a single row)
 * the per-day listening/playtime strips all draw. One visual language: 7 rows by
 * default, `--heat-0..4` buckets, a "today" tint.
 *
 * Two modes:
 *  - **static** (default): renders `<i>` cells — a read-only heatmap.
 *  - **selectable**: renders `<button>` cells that emit `select` with the cell
 *    index and highlight `selectedIndex`. This is how the day strips drill in —
 *    the same grid the calendars use, so the columns-vs-heat split is gone.
 *
 * Deliberately dumb about meaning: it takes finished cells (level + optional
 * today/title) and renders them. *How* a level is computed, and what a cell maps
 * back to, stays with each caller. Colour is entirely from `--heat-*` tokens, so
 * light/dark follow the theme with no per-cell style.
 */
const {
  cells,
  rows = 7,
  minCell = 10,
  selectable = false,
  selectedIndex = null,
} = defineProps<{
  cells: HeatCell[];
  /** Cells per column. 7 = a week (calendars); 1 = a single horizontal strip. */
  rows?: number;
  /** Minimum cell edge in px (columns grow to fill past this). */
  minCell?: number;
  /** Render cells as clickable buttons that emit `select`. */
  selectable?: boolean;
  /** Index of the highlighted cell, or null when nothing is drilled in. */
  selectedIndex?: number | null;
}>();

const emit = defineEmits<{ select: [index: number] }>();

// When a cell is picked, the rest dim so the selection reads clearly (the pattern
// the old bar strips used). Only in selectable mode, only once something is picked.
const dimmed = () => selectable && selectedIndex !== null;
</script>

<template>
  <div class="hg" :class="{ dim: dimmed() }" :style="{ '--hg-rows': rows, '--hg-min': `${minCell}px` }">
    <component
      :is="selectable ? 'button' : 'i'"
      v-for="(c, i) in cells"
      :key="i"
      class="hg-c"
      :class="{ on: selectable && i === selectedIndex }"
      :type="selectable ? 'button' : undefined"
      :data-l="c.level || null"
      :data-now="c.today ? '' : null"
      :title="c.title || undefined"
      :aria-pressed="selectable ? i === selectedIndex : undefined"
      @click="selectable ? emit('select', i) : undefined"
    />
  </div>
</template>

<style scoped>
.hg {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(var(--hg-min), 1fr);
  grid-template-rows: repeat(var(--hg-rows), 1fr);
  gap: 3px;
  overflow-x: auto;
  padding-bottom: var(--sp-2);
}
.hg-c {
  aspect-ratio: 1;
  min-width: var(--hg-min);
  border: 0;
  border-radius: 2px;
  background: var(--heat-0);
  display: block;
  padding: 0;
}
.hg-c[data-l="1"] {
  background: var(--heat-1);
}
.hg-c[data-l="2"] {
  background: var(--heat-2);
}
.hg-c[data-l="3"] {
  background: var(--heat-3);
}
.hg-c[data-l="4"] {
  background: var(--heat-4);
}
.hg-c[data-now] {
  background: var(--heat-today);
}

/* Interactive cells. */
button.hg-c {
  cursor: pointer;
  transition:
    opacity var(--dur-fast) var(--ease-out),
    outline-color var(--dur-fast) var(--ease-out);
}
button.hg-c:hover {
  opacity: 0.85;
}
.hg.dim button.hg-c {
  opacity: 0.4;
}
.hg.dim button.hg-c.on,
button.hg-c.on {
  opacity: 1;
  outline: 2px solid var(--live-ink);
  outline-offset: 1px;
}
button.hg-c:focus-visible {
  outline: 2px solid var(--live-ink);
  outline-offset: 1px;
}
</style>
