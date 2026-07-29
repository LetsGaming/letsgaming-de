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
  /**
   * How the children separate.
   *
   * `tiles` — each child is its own bordered surface, so the grid just spaces them.
   * `figures` — the children are bare readouts ruled off from each other
   * (`StatTile size="lead"`), so the column gap closes up and the rule sits in the
   * gutter instead of beside it.
   *
   * Stated rather than sniffed: a `:has(> .st--lead)` selector would infer it, but
   * scoped-CSS rewriting inside `:has()` is exactly the kind of thing that fails
   * silently and leaves the gap looking almost right.
   */
  separation?: "tiles" | "figures";
}
withDefaults(defineProps<Props>(), { columns: 4, separation: "tiles" });
</script>

<template>
  <div class="statgrid" :class="[`statgrid--${columns}`, `statgrid--${separation}`]">
    <slot />
  </div>
</template>

<style scoped>
.statgrid {
  display: grid;
  gap: var(--sp-14);
}
/* Lead figures separate with a hairline instead of a box each (see StatTile), so
   the rule wants to sit in the gutter rather than beside it: the column gap goes
   to zero and each figure carries its own inset. Row gap stays, and grows a little
   — with vertical rules in play, rows need to read as rows.
 *
 * The first figure in each row owns the left edge and takes no rule. Which children
 * those are depends on the column count, which is this component's business — hence
 * the exception living here and not in the tile. */
.statgrid--figures {
  column-gap: 0;
  row-gap: var(--sp-22);
}
.statgrid--figures.statgrid--4 > :slotted(*:nth-child(4n + 1)),
.statgrid--figures.statgrid--3 > :slotted(*:nth-child(3n + 1)),
.statgrid--figures.statgrid--2 > :slotted(*:nth-child(2n + 1)) {
  padding-inline-start: 0;
  border-inline-start: 0;
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
  /* Two columns now, so the rule falls on even children regardless of the
     declared count — otherwise a 4-up grid keeps a rule on its third figure and
     draws it down the left margin of the page. */
  .statgrid--figures.statgrid--4 > :slotted(*),
  .statgrid--figures.statgrid--3 > :slotted(*) {
    padding-inline-start: var(--sp-20);
    border-inline-start: 1px solid var(--line-1);
  }
  .statgrid--figures.statgrid--4 > :slotted(*:nth-child(2n + 1)),
  .statgrid--figures.statgrid--3 > :slotted(*:nth-child(2n + 1)) {
    padding-inline-start: 0;
    border-inline-start: 0;
  }
}
</style>
