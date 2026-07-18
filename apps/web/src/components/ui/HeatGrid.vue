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
 * contribution graph and the weekday×hour playtime heatmap both draw. They had
 * two copies (Activity's global `.heat`, Playtime's scoped `.pt-heat`) that
 * agreed on the visual language — 7 rows, `--heat-0..4` buckets, a "today" tint —
 * and drifted only on cell radius and the coloring mechanism (inline style vs.
 * `data-l`). This is that grid, once.
 *
 * Deliberately dumb: it takes finished cells (level + optional today/title) and
 * renders them. *How* a level is computed stays with each caller — contributions
 * bucket by threshold on the server, playtime by linear quartile on the client —
 * because those are genuinely different questions, not one abstraction. Callers
 * own their axis labels and legend too; this is only the grid.
 *
 * Cells fill column-major (`grid-auto-flow: column` over `--hg-rows` rows), so the
 * caller hands cells in that order (a week per column). Colour is entirely from
 * `--heat-*` tokens, so light/dark follow the theme with no per-cell style.
 */
const {
  cells,
  rows = 7,
  minCell = 10,
} = defineProps<{
  cells: HeatCell[];
  /** Cells per column. 7 = a week, the default for both current callers. */
  rows?: number;
  /** Minimum cell edge in px (columns grow to fill past this). */
  minCell?: number;
}>();
</script>

<template>
  <div class="hg" :style="{ '--hg-rows': rows, '--hg-min': `${minCell}px` }">
    <i
      v-for="(c, i) in cells"
      :key="i"
      :data-l="c.level || null"
      :data-now="c.today ? '' : null"
      :title="c.title || undefined"
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
.hg i {
  aspect-ratio: 1;
  min-width: var(--hg-min);
  border-radius: 2px;
  background: var(--heat-0);
  display: block;
}
.hg i[data-l="1"] {
  background: var(--heat-1);
}
.hg i[data-l="2"] {
  background: var(--heat-2);
}
.hg i[data-l="3"] {
  background: var(--heat-3);
}
.hg i[data-l="4"] {
  background: var(--heat-4);
}
.hg i[data-now] {
  background: var(--heat-today);
}
</style>
