<script setup lang="ts" generic="T extends string">
/**
 * A small segmented control: two or three mutually exclusive options, the current
 * one filled in.
 *
 * There were three of these — theme and language in the settings modal, and the
 * owner/local timezone toggle on the playtime heatmap — written three times with
 * three sets of near-identical styles and only one of them carrying any ARIA. The
 * accessible shape now comes with the component: a labelled `role="group"` and
 * `aria-pressed` per option, so a screen reader announces which segment is on
 * rather than reading two unrelated buttons.
 *
 * Two-way bound with `defineModel`, so a caller writes `v-model="theme"` rather
 * than a prop/emit pair.
 *
 * `size` covers the one real difference between the copies: the settings modal's
 * is a standing control, the heatmap's is a caption-sized note in a card header.
 */
interface Option<V extends string> {
  value: V;
  label: string;
}
interface Props {
  options: readonly Option<T>[];
  /** Names the group for assistive tech, e.g. "Show times in". */
  label: string;
  size?: "md" | "sm";
}
withDefaults(defineProps<Props>(), { size: "md" });

const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="seg" :class="`seg--${size}`" role="group" :aria-label="label">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="seg__opt"
      :class="{ on: model === opt.value }"
      :aria-pressed="model === opt.value"
      @click="model = opt.value"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
  border: 1px solid var(--line-1);
}
.seg__opt {
  font-family: var(--f-m);
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
}
.seg__opt:hover {
  color: var(--ink);
}

/* The standing control (settings modal). */
.seg--md {
  gap: var(--sp-4);
  background: var(--surf-0);
  border-radius: var(--r-card);
  padding: 3px;
}
.seg--md .seg__opt {
  font-size: 13px;
  border-radius: 9px;
  padding: 7px var(--sp-16);
}
.seg--md .seg__opt.on {
  background: var(--surf-2);
  color: var(--ink-strong);
}

/* The caption-sized control that sits in a card header.
   The values are the ones the playtime toggle intended, but written in the public
   token names: it reached for `--bg-base`, `--r-s`, `--r-xs` and `--card-2`, which
   are CMS-only aliases scoped to `.cms` in tokens.css. Outside the CMS they
   resolve to nothing, so the control rendered with no surface, border-radius or
   fill — and the token linter passed the whole time, because the names do exist,
   just not in that scope. */
.seg--sm {
  gap: var(--sp-2);
  background: var(--surf-0);
  border-radius: var(--r-control);
  padding: var(--sp-2);
}
.seg--sm .seg__opt {
  font-size: var(--fs-micro);
  border-radius: var(--r-chip);
  padding: 1px var(--sp-6);
}
.seg--sm .seg__opt.on {
  color: var(--live-ink);
  background: var(--surf-2);
}
</style>
