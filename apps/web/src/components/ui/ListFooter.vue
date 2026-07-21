<script setup lang="ts">
/**
 * The row under a capped list: a "show more / less" toggle when there are rows to
 * reveal, and a muted "and N more" when the server-side cap hides rows the viewer
 * can't page to. Pairs with `useLimitedList`, which computes both counts. With
 * neither it collapses to nothing (`:empty`). Shared by Listening and Time-played,
 * which rendered this identical footer twice.
 */
interface Props {
  /** Rows hidden behind the toggle — the "show N more" count. 0 hides the toggle. */
  moreCount: number;
  /** Whether the toggle is currently expanded. */
  expanded: boolean;
  /** Rows past the server cap that no toggle can reveal — the "and N more" note. */
  overflow?: number;
}
defineProps<Props>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <p class="list-footer">
    <button v-if="moreCount > 0" class="list-footer__more" @click="emit('toggle')">
      {{ expanded ? "show less" : `show ${moreCount} more` }}
    </button>
    <span v-if="overflow && overflow > 0" class="list-footer__cap">and {{ overflow }} more</span>
  </p>
</template>

<style scoped>
.list-footer {
  display: flex;
  align-items: baseline;
  gap: var(--sp-10);
  padding-top: var(--sp-8);
}
/* Hidden when neither the toggle nor the cap note renders (mirrors the old foot). */
.list-footer:empty {
  display: none;
}
.list-footer__more {
  font: inherit;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--live-ink);
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0;
}
.list-footer__more:hover {
  text-decoration: underline;
}
.list-footer__cap {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
</style>
