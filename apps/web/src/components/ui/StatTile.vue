<script setup lang="ts">
/**
 * A headline stat tile: a big number and a label. Inert by default; pass
 * `interactive` to make it a tab — a button with a chevron and an `aria-pressed`
 * state — which is how the Listening module's stats double as navigation. Playtime
 * uses the inert form (one list, nothing to switch between).
 *
 * Two sizes, because there were already two of these. `inset` is the compact tile
 * inside a ModuleCard (Listening, Time played, Wrapped) — a control, so it keeps its
 * surface and border. `lead` opens a dashboard (Activity, Glance) and is no longer a
 * tile at all: a bare figure, separated from its neighbours by a hairline. It lived
 * as a global `.stat` rule and had drifted apart in surface, radius, type scale and
 * shadow; same component now, and the difference is a prop rather than an accident.
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
  /** `inset` sits inside a card; `lead` opens a dashboard. */
  size?: "inset" | "lead";
}
withDefaults(defineProps<Props>(), { size: "inset" });
const emit = defineEmits<{ select: [] }>();
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="st"
    :class="[`st--${size}`, { 'st-tab': interactive }]"
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
  border: 1px solid var(--line-1);
}
.st--inset {
  background: var(--surf-2);
  border-radius: var(--r-control);
  padding: var(--sp-12) var(--sp-14);
}
/* The former global `.stat`. No longer a card.
 *
 * These were four lifted boxes — surface, border, radius, shadow — each holding one
 * number, and they opened both the home page and /code. Four peer readouts don't
 * need four containers: a card's job is to say "this is a separate surface", and
 * saying it four times in a row about four equivalent figures says nothing. It also
 * spent the page's one elevation signal on its least hierarchical content, so the
 * stat row landed with the same weight as the hero and the project grid.
 *
 * Now: alignment plus a hairline, which is step two of the ladder instead of step
 * five. The figure gets larger because it no longer competes with a box for
 * attention, and the row reads as one band rather than four objects — which is
 * also closer to what it is, a readout off a sync. */
.st--lead {
  padding: var(--sp-2) 0 var(--sp-2) var(--sp-20);
  border: 0;
  border-inline-start: 1px solid var(--line-1);
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
.st--lead .st-n {
  font-family: var(--f-b);
  font-weight: 700;
  font-size: 34px;
  letter-spacing: -0.02em;
  /* Counters, and a row of them read down the column — proportional figures make
     the digits sit at different widths per tile and the row stops aligning. */
  font-variant-numeric: tabular-nums;
}
/* A <Duration> in the value slot renders its own units; scoped styles don\'t
   reach slotted content, so they need naming explicitly. */
.st-n :slotted(small),
.st-n small {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  margin-left: var(--sp-2);
}
.st--lead .st-n :slotted(small),
.st--lead .st-n small {
  font-family: inherit;
  font-size: var(--fs-body);
  font-weight: 600;
}
.st-l {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
  font-size: var(--fs-meta);
  color: var(--muted);
  margin-top: var(--sp-4);
}
.st--lead .st-l {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  margin-top: 7px;
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
  .st--inset .st-n {
    font-size: 20px;
  }
  .st--inset {
    padding: var(--sp-10);
  }
}
</style>
