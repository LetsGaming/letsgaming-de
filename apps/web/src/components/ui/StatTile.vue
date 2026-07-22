<script setup lang="ts">
/**
 * A headline stat tile: a big number and a label. Inert by default; pass
 * `interactive` to make it a tab — a button with a chevron and an `aria-pressed`
 * state — which is how the Listening module's stats double as navigation. Playtime
 * uses the inert form (one list, nothing to switch between).
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
}
defineProps<Props>();
const emit = defineEmits<{ select: [] }>();
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="st"
    :class="{ 'st-tab': interactive }"
    :aria-pressed="interactive ? active : undefined"
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
  text-align: left;
  font: inherit;
  background: var(--surf-2);
  border: 1px solid var(--line-1);
  border-radius: var(--r-control);
  padding: var(--sp-12) var(--sp-14);
}
.st-tab {
  cursor: pointer;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}
.st-tab:hover {
  background: var(--surf-3);
}
.st-tab[aria-pressed="true"] {
  border-color: var(--line-2);
  background: var(--surf-3);
}
.st-n {
  display: block;
  font-family: var(--f-d);
  font-size: 24px;
  color: var(--ink-strong);
  line-height: 1;
}
/* A <Duration> in the value slot renders its own units; scoped styles don\'t
   reach slotted content, so they need naming explicitly. */
.st-n :slotted(small),
.st-n small {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  margin-left: 2px;
}
.st-l {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
  font-size: var(--fs-meta);
  color: var(--muted);
  margin-top: var(--sp-4);
}
.st-tab .st-l::after {
  content: "›";
  color: var(--muted);
  font-size: 14px;
  margin-left: auto;
  transition: transform var(--dur-fast) var(--ease-out);
}
.st-tab[aria-pressed="true"] .st-l::after {
  color: var(--live-ink);
  transform: rotate(90deg);
}

@container (max-width: 420px) {
  .st-n {
    font-size: 20px;
  }
  .st {
    padding: var(--sp-10);
  }
}
</style>
