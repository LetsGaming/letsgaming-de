<script lang="ts">
/**
 * Cell contract lives in a normal <script> block so it can be exported as a type
 * (`<script setup>` can't carry top-level exports).
 */
export interface HeatCell {
  /** Intensity bucket 0–4; 0 is the empty base and gets no `data-l`. */
  level: number;
  /** Mark this cell as "today/now" — a subtle ring, never the selection accent. */
  today?: boolean;
  /** Native tooltip for the cell. */
  title?: string;
}
</script>

<script setup lang="ts">
/**
 * A column-flow grid of intensity-bucketed cells — the shape GitHub's
 * contribution graph, the weekday×hour playtime heatmap, and (as a single row)
 * the per-day listening/playtime strips all draw. One visual language: `--heat-0..4`
 * buckets, an optional legend, a "today" ring.
 *
 * Two modes:
 *  - **static** (default): `<i>` cells — a read-only heatmap.
 *  - **selectable**: `<button>` cells that emit `select` with the cell index and
 *    highlight `selectedIndex`. This is how the day strips drill in.
 *
 * "Today" and "selected" are deliberately different marks. Today keeps its level
 * colour and gets a faint inset ring (like GitHub's border on the current day);
 * selection is a bold accent outline with the rest dimmed. Filling today with the
 * accent — as this used to — made it read as permanently selected, which is the
 * bug this fixes.
 *
 * Sizing: cells are square and fill the width by default (good when there are many
 * columns). Pass `cellHeight` to fix a short height instead — the right call for a
 * single row of a handful of days, where square-and-fill would blow the cells up.
 *
 * Deliberately dumb about meaning: it takes finished cells and renders them. *How*
 * a level is computed, and what a cell maps back to, stays with each caller. Colour
 * is entirely from `--heat-*` tokens, so light/dark follow the theme.
 */
import { computed } from "vue";

const {
  cells,
  rows = 7,
  minCell = 10,
  cellHeight = null,
  legend = false,
  selectable = false,
  selectedIndex = null,
} = defineProps<{
  cells: HeatCell[];
  /** Cells per column. 7 = a week (calendars); 1 = a single horizontal strip. */
  rows?: number;
  /** Minimum cell edge in px (columns grow to fill past this). */
  minCell?: number;
  /** Fixed cell height in px. When set, cells fill width at this height instead of
   *  being square — keeps a short strip from ballooning when there are few cells. */
  cellHeight?: number | null;
  /** Show the "less ▢▢▢▢▢ more" scale below the grid. */
  legend?: boolean;
  /** Render cells as clickable buttons that emit `select`. */
  selectable?: boolean;
  /** Index of the highlighted cell, or null when nothing is drilled in. */
  selectedIndex?: number | null;
}>();

const emit = defineEmits<{ select: [index: number] }>();

// When a cell is picked, the rest dim so the selection reads clearly. Only in
// selectable mode, only once something is picked.
const dimmed = computed(() => selectable && selectedIndex !== null);
const gridStyle = computed(() => ({
  "--hg-rows": rows,
  "--hg-min": `${minCell}px`,
  ...(cellHeight != null ? { "--hg-ch": `${cellHeight}px` } : {}),
}));
</script>

<template>
  <div
    class="hg"
    :class="{ dim: dimmed, 'fixed-h': cellHeight != null }"
    :style="gridStyle"
  >
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
  <div v-if="legend" class="hg-legend">
    <span>less</span>
    <i v-for="n in 5" :key="n" :data-l="(n - 1) || null" />
    <span>more</span>
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
  /* Room for the selected cell's outline (outset ring) so overflow clipping at the
     padding edge doesn't shave it off. */
  padding: 4px;
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
/* Fixed-height mode: fill width, short cells, no square constraint. */
.hg.fixed-h .hg-c {
  aspect-ratio: auto;
  height: var(--hg-ch);
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
/* Today: keep the level colour, add a faint inset ring — never the accent, so it
   can't be mistaken for the selection. */
.hg-c[data-now] {
  outline: 1.5px solid var(--heat-today);
  outline-offset: -1.5px;
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
/* Selection: bold accent ring, full opacity, lifted above neighbours so no
   adjacent cell paints over its ring. Wins over the today ring when today is
   selected. The container's padding keeps the ring from being clipped. */
.hg.dim button.hg-c.on,
button.hg-c.on {
  opacity: 1;
  outline: 2px solid var(--live-ink);
  outline-offset: 1px;
  position: relative;
  z-index: 1;
}
button.hg-c:focus-visible {
  outline: 2px solid var(--live-ink);
  outline-offset: 1px;
}

/* Legend — the scale that used to live in the Activity section, now shared. */
.hg-legend {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
  justify-content: flex-end;
  margin-top: var(--sp-12);
  font-family: var(--f-m);
  font-size: 10px;
  color: var(--muted);
}
.hg-legend i {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: block;
  background: var(--heat-0);
}
.hg-legend i[data-l="1"] {
  background: var(--heat-1);
}
.hg-legend i[data-l="2"] {
  background: var(--heat-2);
}
.hg-legend i[data-l="3"] {
  background: var(--heat-3);
}
.hg-legend i[data-l="4"] {
  background: var(--heat-4);
}
</style>
