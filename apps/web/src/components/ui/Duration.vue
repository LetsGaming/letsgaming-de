<script setup lang="ts">
/**
 * A duration, rendered the way people read one: `1h 15min`, not `75min`.
 *
 * The single place the site turns a minute count into text. Every module counts in
 * minutes — plays, sessions, heat buckets — and each used to format its own, so
 * Listening said "75 min", Time played said "1.3h", and Wrapped said "265min" for
 * the same kind of quantity. One component, one rule.
 *
 * Whole hours drop the minutes (`2h`, not `2h 0min`) and anything under an hour is
 * minutes only, so the common cases stay short. Units come from the EN/DE catalog
 * and render small, matching the number/unit pairing StatTile and RankedRow already
 * use.
 */
import { computed } from "vue";
import { splitDuration } from "@lg/core";
import { useT } from "~/composables/useT";

const props = defineProps<{
  /** Total minutes. Fractions and negatives are coerced, never thrown. */
  minutes: number;
}>();

const { t } = useT();
// Which halves to render is `splitDuration`'s call, not this component's — the
// same rule has to hold for the plain-text form (`useT().duration()`).
const parts = computed(() => splitDuration(props.minutes));
</script>

<template>
  <span class="dur">
    <template v-if="parts.showHours"
      >{{ parts.hours }}<small>{{ t("hoursShort") }}</small></template
    ><template v-if="parts.showMinutes"
      ><span v-if="parts.showHours" class="dur-gap"> </span>{{ parts.minutes
      }}<small>{{ t("minutesShort") }}</small></template
    >
  </span>
</template>

<style scoped>
/* Keeps "1h 15min" from breaking across lines mid-duration. */
.dur {
  white-space: nowrap;
}
</style>
