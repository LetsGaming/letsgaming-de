<script setup lang="ts">
/**
 * The content region of a ledger module: a top list, or one day drilled into.
 *
 * `useLedgerStrip` already made the *behaviour* shared — Listening and Time played
 * drive the strip, the fetch and the reset from one composable. This is the other
 * half: the panel around it, which the two modules still rendered twice. Same
 * header, same back control, same loading/error/empty branches, same four scoped
 * CSS rules differing only in a `mu-`/`pt-` prefix.
 *
 * What varies is content, so it comes in through slots: `summary` (the day's
 * one-line total) and the default slot (the rows and their footer). The states
 * that aren't content — loading, failed, an empty day — are handled here, since
 * both modules stated them identically and one of them getting a new one and the
 * other not is exactly the drift this removes.
 */
import CardHeader from "./CardHeader.vue";
import { useT } from "~/composables/useT";

interface Props {
  /** Heading when no day is selected, e.g. "Top games". */
  title: string;
  /** Heading when a day is selected — the formatted day. */
  dayTitle: string;
  /** Label for the control that leaves the day view. */
  backLabel: string;
  /** The selected day, or null for the top-level list. */
  selected: string | null;
  loading: boolean;
  error: boolean;
  /** False when the loaded day turned out to have nothing in it. */
  hasDay: boolean;
  /** Shown in place of the rows when the day is empty. */
  emptyLabel: string;
}
defineProps<Props>();
const emit = defineEmits<{ back: [] }>();

const { t } = useT();
</script>

<template>
  <div class="drill">
    <CardHeader :title="selected ? dayTitle : title">
      <template #note>
        <button v-if="selected" type="button" class="drill__back" @click="emit('back')">
          {{ backLabel }}
        </button>
      </template>
    </CardHeader>

    <!-- A day drilled into: its own states, then the caller's rows. -->
    <template v-if="selected">
      <p v-if="loading" class="drill__dim">{{ t("loading") }}</p>
      <p v-else-if="error" class="drill__dim">{{ t("loadDayFailed") }}</p>
      <p v-else-if="!hasDay" class="drill__dim drill__empty">{{ emptyLabel }}</p>
      <template v-else>
        <p class="drill__sum"><slot name="summary" /></p>
        <slot name="day" />
      </template>
    </template>

    <!-- The top-level list. -->
    <slot v-else />
  </div>
</template>

<style scoped>
.drill__back {
  font: inherit;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0;
}
.drill__back:hover {
  color: var(--ink);
}
.drill__dim {
  color: var(--muted);
  font-size: var(--fs-meta);
  padding: var(--sp-8) 0;
}
.drill__empty {
  text-align: center;
  padding: var(--sp-16) 0;
}
.drill__sum {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  margin-bottom: var(--sp-4);
}
</style>
