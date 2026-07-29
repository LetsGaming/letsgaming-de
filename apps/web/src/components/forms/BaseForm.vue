<script setup lang="ts">
import type { SubmitState } from "../../composables/useSubmit";

defineProps<{
  state: SubmitState;
  error: string;
  /** Idle button label, and the label shown while sending. */
  submitLabel: string;
  sendingLabel: string;
}>();
defineEmits<{ submit: [] }>();
</script>

<template>
  <form class="form" @submit.prevent="$emit('submit')">
    <div v-if="state === 'sent'" class="ok"><slot name="success" /></div>
    <template v-else>
      <!-- fields + honeypot supplied by the specific form -->
      <slot />
      <div class="foot">
        <span v-if="state === 'error'" class="err">{{ error }}</span>
        <button class="btn btn-primary" type="submit" :disabled="state === 'sending'">
          {{ state === "sending" ? sendingLabel : submitLabel }}
        </button>
      </div>
    </template>
  </form>
</template>

<style scoped>
/* Shared form styling. Fields come in through the default slot, so the field
   rules use :slotted() to reach the parent-rendered label/input/textarea. */
.form { display: flex; flex-direction: column; gap: var(--sp-12); max-width: 560px; }
:slotted(label) { display: flex; flex-direction: column; gap: 5px; font-family: var(--f-m); font-size: var(--fs-meta); color: var(--muted); }
:slotted(input), :slotted(textarea) { font-family: var(--f-b); font-size: var(--fs-body); color: var(--ink); background: var(--surf-1); border: 1px solid var(--line-1); border-radius: 11px; padding: 11px 13px; width: 100%; }
/* Pointer focus gets the border shift only; keyboard focus keeps the site's ring.
 *
 * This was `input:focus { outline: none }`, which out-specifies the global
 * `:focus-visible` rule in app.css — so the two inputs a visitor actually types
 * into were the only focusable things on the site with no ring, and the fallback
 * was a 1px border going from rgba(255,255,255,.07) to --ink. Perceptible, but a
 * border-colour-only indicator is the exact pattern WCAG 2.4.11 exists to catch. */
:slotted(input:focus), :slotted(textarea:focus) { border-color: var(--ink); }
:slotted(input:focus:not(:focus-visible)), :slotted(textarea:focus:not(:focus-visible)) { outline: none; }
:slotted(textarea) { resize: vertical; }
:slotted(.hp) { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-14); flex-wrap: wrap; }
.err { color: var(--danger-ink); font-size: 13px; margin-right: auto; }
.ok { background: var(--surf-2); color: var(--ink-strong); border: 1px solid var(--line-1); border-radius: 12px; padding: var(--sp-16) var(--sp-18); font-family: var(--f-m); }
button:disabled { opacity: 0.6; cursor: default; }
</style>
