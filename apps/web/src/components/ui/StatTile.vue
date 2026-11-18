<script setup lang="ts">
/**
 * A figure: a large number over a small label, set on a hairline. Inert by default;
 * pass `interactive` to make it a tab (a button with `aria-pressed`), which is how
 * the Listening stats double as navigation. `display` is the one oversized figure
 * of a poster (Wrapped).
 */
interface Props {
  /** The readout. Omit and use the `value` slot for richer content (a Duration). */
  value?: string | number;
  label: string;
  /** Render as a clickable tab rather than a static readout. */
  interactive?: boolean;
  /** For an interactive tile: whether it's the selected tab. */
  active?: boolean;
  /** Small unit suffix after the number, e.g. "h". */
  unit?: string;
  size?: "figure" | "display";
}
withDefaults(defineProps<Props>(), { size: "figure" });
const emit = defineEmits<{ select: [] }>();
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="st"
    :class="[`st--${size}`, { 'st-tab': interactive }]"
    :aria-pressed="interactive ? active : undefined"
    :type="interactive ? 'button' : undefined"
    @click="interactive ? emit('select') : undefined"
  >
    <span class="st-n">
      <slot name="value">{{ value }}<small v-if="unit">{{ unit }}</small></slot>
    </span>
    <span class="st-l">{{ label }}</span>
  </component>
</template>

<style scoped>
.st {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-3) 0 0;
  border: 0;
  border-top: 1px solid var(--line-1);
  background: none;
  font: inherit;
  text-align: left;
  color: inherit;
}
.st-tab {
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.st-tab:hover {
  border-top-color: var(--line-control);
}
.st-tab[aria-pressed="true"] {
  border-top-color: var(--ink-strong);
}
.st-n {
  display: block;
  font-family: var(--f-d);
  font-weight: 700;
  font-size: var(--fs-figure);
  line-height: 1;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.st--display .st-n {
  font-size: var(--fs-display);
  font-stretch: 75%;
  letter-spacing: -0.01em;
}
.st-tab[aria-pressed="true"] .st-n {
  color: var(--ink-strong);
}
.st-n :slotted(small),
.st-n small {
  margin-left: var(--space-1);
  font-family: var(--f-b);
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--muted);
}
.st-l {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-small);
  color: var(--muted);
}
.st-tab[aria-pressed="true"] .st-l {
  color: var(--ink-strong);
}
.st-tab .st-l::after {
  content: "›";
  font-size: var(--fs-small);
  transition: transform var(--dur-fast) var(--ease-out);
}
.st-tab[aria-pressed="true"] .st-l::after {
  transform: rotate(90deg);
}
</style>
