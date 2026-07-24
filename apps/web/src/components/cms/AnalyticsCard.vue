<script setup lang="ts">
/**
 * One analytics card: a heading and a ranked key/count list, capped.
 *
 * Seven cards were rendering `v-for` over the full server response, and the
 * server returns up to 20 rows per dimension. On a day of scanner traffic that's
 * twenty single-hit paths stacked into a column tall enough to push everything
 * below it off the screen, with the long ones running out the side of the card.
 *
 * The cap is `useLimitedList` and the toggle is `ListFooter` — the same pair the
 * top-songs and top-games lists use, so "collapse to five, expand to the cap,
 * then say how many the cap hid" stays one implementation. The alternative was an
 * eighth copy of it inside the CMS.
 */
import { computed } from "vue";
import type { AnalyticsRow } from "@lg/core";
import { useLimitedList } from "../../composables/useLimitedList";
import ListFooter from "../ui/ListFooter.vue";

const props = withDefaults(
  defineProps<{
    title: string;
    /** Muted note after the title, e.g. "(not counted as visits)". */
    note?: string;
    rows?: AnalyticsRow[];
    /** Shown in place of the list when there's nothing. */
    empty?: string;
    /** How many before "show more". */
    initial?: number;
  }>(),
  { initial: 5 },
);

const rows = computed(() => props.rows ?? []);
const {
  shown,
  expanded,
  moreCount,
} = useLimitedList({
  rows,
  initial: () => props.initial,
  // The server already caps each dimension, so what's on hand *is* the cap;
  // there's no hidden remainder for the footer to report.
  max: () => rows.value.length,
});
</script>

<template>
  <div class="card">
    <h3>{{ title }} <span v-if="note" class="muted">{{ note }}</span></h3>
    <ul v-if="shown.length">
      <li v-for="r in shown" :key="r.key">
        <!-- `title` because the value is truncated: a scanner path can be 80
             characters, and the point of showing it is being able to read it. -->
        <span class="rowkey" :title="r.key">{{ r.key }}</span>
        <b>{{ r.count }}</b>
      </li>
    </ul>
    <p v-else-if="empty" class="muted">{{ empty }}</p>
    <ListFooter :more-count="moreCount" :expanded="expanded" @toggle="expanded = !expanded" />
    <slot />
  </div>
</template>

<style scoped>
/* Long keys truncate instead of widening the card. Scanner paths regularly run
   past 60 characters, and a grid column that grows to fit one of them drags the
   whole row's layout with it. */
.rowkey {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>
