<script setup lang="ts">
import { useT } from "~/composables/useT";

const { t } = useT();
/**
 * The row under a capped list: a "show more / less" toggle when there are rows to
 * reveal, and a muted "and N more" when the server-side cap hides rows the viewer
 * can't page to. Pairs with `useLimitedList`, which computes both counts. With
 * neither it collapses to nothing (`:empty`). Shared by Listening and Time-played,
 * which rendered this identical footer twice.
 */
interface Props {
  /** Rows hidden behind the toggle, the "show N more" count. 0 hides the toggle. */
  moreCount: number;
  /** Whether the toggle is currently expanded. */
  expanded: boolean;
  /** Rows past the server cap that no toggle can reveal, the "and N more" note. */
  overflow?: number;
}
defineProps<Props>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <p class="list-footer">
    <button v-if="moreCount > 0" class="list-footer__more" @click="emit('toggle')">
      {{ expanded ? t("showLess") : t("showMore", { n: moreCount }) }}
    </button>
    <span v-if="overflow && overflow > 0" class="list-footer__cap">{{ t("andMore", { n: overflow }) }}</span>
  </p>
</template>

<style scoped>
.list-footer {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding-top: var(--space-3);
}
/* Hidden when neither the toggle nor the cap note renders (mirrors the old foot). */
.list-footer:empty {
  display: none;
}
.list-footer__more {
  font: inherit;
  font-family: var(--f-b);
  font-size: var(--fs-small);
  color: var(--ink);
  background: none;
  border: 0;
  cursor: pointer;
  padding: var(--sp-2) 0;
  min-height: 24px;
}
@media (pointer: coarse) {
  .list-footer__more {
    min-height: 44px;
  }
}
.list-footer__more:hover {
  text-decoration: underline;
}
.list-footer__cap {
  font-family: var(--f-b);
  font-size: var(--fs-meta);
  color: var(--muted);
}
</style>
