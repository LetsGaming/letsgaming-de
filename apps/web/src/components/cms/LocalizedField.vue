<script setup lang="ts">
/**
 * An input bound to one field of a `Localized` value, in the locale the CMS is
 * currently editing.
 *
 * Every panel wrote this by hand:
 *
 *   <input :value="lv(x, locale)"
 *          @input="setLv(x, locale, ($event.target as HTMLInputElement).value)" />
 *
 * — 28 times across six panels, each repeating the read, the write, and an inline
 * DOM cast. The cast is the part worth removing: it's `as HTMLInputElement` in the
 * input case and `as HTMLTextAreaElement` in the textarea case, asserted at every
 * call site, so a wrong one is a silent type lie rather than a compile error. Here
 * it's written once, correctly, and the panels just say which field they're
 * editing.
 *
 * `field` is mutated in place, which is what `setLv` already did — the CMS edits a
 * live draft object and saves it explicitly, so this is the existing model, not a
 * new one.
 */
import type { Localized } from "@lg/core";
import { useCmsContext } from "../../composables/cmsContext";

withDefaults(
  defineProps<{
    /** The localized value to edit. Mutated in place. */
    field: Localized;
    /** Render a textarea instead of a single-line input. */
    textarea?: boolean;
    /** Rows, when `textarea` is set. */
    rows?: number;
  }>(),
  { textarea: false, rows: 2 },
);

const { lv, setLv, locale } = useCmsContext();

function onInput(event: Event, field: Localized): void {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  if (target) setLv(field, locale.value, target.value);
}
</script>

<template>
  <textarea
    v-if="textarea"
    :rows="rows"
    :value="lv(field, locale)"
    @input="onInput($event, field)"
  />
  <input v-else :value="lv(field, locale)" @input="onInput($event, field)" />
</template>
