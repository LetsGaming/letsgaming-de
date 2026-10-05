<script setup lang="ts">
/**
 * Display settings of a ranked-list module: rows shown, row cap, opening window.
 * Listening and Played are this same form over different state, so they share it.
 */
import { computed, useId } from "vue";
import { ACTIVITY_RANGE_LABELS, type ActivityRange } from "@lg/core";
import { useT } from "~/composables/useT";
import HelpTip from "./HelpTip.vue";
import RangeSelect from "./RangeSelect.vue";

const props = defineProps<{
  /** What the rows are, in the plural: "songs and artists", "games". */
  rows: string;
  bounds: { min: number; max: number };
  /** Implementation detail for the "?" next to the row cap. */
  capDetail: string;
}>();

const initialCount = defineModel<number>("initialCount", { required: true });
const maxCount = defineModel<number>("maxCount", { required: true });
const defaultRange = defineModel<ActivityRange>("defaultRange", { required: true });

const { t } = useT();
const uid = useId();

// The server pins "always show" down to the max on save, so an over-order pair is
// harmless; the summary says what will actually happen.
const shown = computed(() => Math.min(initialCount.value, maxCount.value));
const summary = computed(
  () =>
    `Shows ${shown.value} ${props.rows} up front, up to ${maxCount.value} with “show more”. ` +
    `Opens on ${t(ACTIVITY_RANGE_LABELS[defaultRange.value].long).toLowerCase()}.`,
);
const overMax = computed(() => initialCount.value > maxCount.value);
</script>

<template>
  <div class="listset">
    <div class="lsrow">
      <div class="lsfield">
        <label :for="`${uid}-initial`">Always show</label>
        <input :id="`${uid}-initial`" v-model.number="initialCount" type="number" class="num" :min="bounds.min" :max="bounds.max" />
        <span class="help">Rows before “show more”.</span>
      </div>
      <div class="lsfield">
        <label :for="`${uid}-max`">Show at most<HelpTip :text="capDetail" /></label>
        <input :id="`${uid}-max`" v-model.number="maxCount" type="number" class="num" :min="bounds.min" :max="bounds.max" />
        <span class="help">The most rows the list ever shows.</span>
      </div>
      <div class="lsfield">
        <label :for="`${uid}-range`">Opens on</label>
        <RangeSelect :id="`${uid}-range`" v-model="defaultRange" />
        <span class="help">Where the card starts. Visitors can still switch.</span>
      </div>
    </div>
    <p v-if="overMax" class="help lsnote">“Always show” is above the max, so it is capped to the max on save.</p>
    <p class="help lsnote">{{ summary }}</p>
  </div>
</template>

<style scoped>
.lsrow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-16);
}
.lsfield {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-4);
}
.lsfield label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.num {
  font: inherit;
  font-size: 13px;
  background: var(--card-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  padding: 6px var(--sp-10);
  width: 90px;
}
.lsnote {
  margin-top: var(--sp-12);
}
</style>
