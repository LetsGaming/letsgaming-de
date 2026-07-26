<script setup lang="ts">
/**
 * The CMS's "which window does this module open in" control.
 *
 * Shared by the Played and Listening panels, which need the identical select over
 * the identical option set — the only thing that differs is which ref it binds to.
 * Written once here rather than twice there, so adding a range to
 * `ACTIVITY_RANGES` doesn't need either panel touched.
 *
 * The labels come from the same message catalog the site's own picker renders, so
 * an owner editing in German sees the strings a German visitor will see. They're
 * read in the CMS's editing locale rather than the site's default, which is why
 * this uses `useT()` and not a hardcoded English list.
 *
 * A `<select>`, not a segmented control: this is a form field in a settings pane,
 * not a live view toggle, and five options is past where segments stay readable at
 * panel width.
 */
import { computed } from "vue";
import { ACTIVITY_RANGES, ACTIVITY_RANGE_LABELS, type ActivityRange } from "@lg/core";
import { useT } from "~/composables/useT";

const model = defineModel<ActivityRange>({ required: true });

const { t } = useT();
const options = computed(() =>
  ACTIVITY_RANGES.map((days) => ({ days, label: t(ACTIVITY_RANGE_LABELS[days].long) })),
);

/** `<select>` values are strings; the model is a number. Narrowed on the way back
 *  through the option list, so nothing here has to trust a parse. */
function onChange(event: Event) {
  const raw = Number((event.target as HTMLSelectElement).value);
  const match = ACTIVITY_RANGES.find((days) => days === raw);
  if (match) model.value = match;
}
</script>

<template>
  <select class="rangesel" :value="String(model)" @change="onChange">
    <option v-for="o in options" :key="o.days" :value="String(o.days)">{{ o.label }}</option>
  </select>
</template>

<style scoped>
.rangesel {
  font: inherit;
  font-size: 13px;
  background: var(--card-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  padding: 6px var(--sp-10);
}
</style>
