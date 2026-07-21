<script setup lang="ts">
/**
 * A card's header row: a title on the left, an optional note on the right. Used
 * for a card's own header (Played · "last 14 days") and for a section within a
 * card (Top games, carrying a "← back" control) — the same title/note shape the
 * module structure repeats, whether it was the inline `.mu-card-h` / `.pt-card-h`
 * or the stacked `.box h3` + `.sub`.
 *
 * The note is plain text via `note`, or arbitrary content via the `note` slot (a
 * back button, a segmented timezone control). `as` picks the title element: a real
 * <h3> by default, since a card section is a genuine subheading, or a <span> where
 * a heading would only duplicate the section's own <h2> in the document outline
 * (Listening's card is itself titled "Listening").
 */
interface Props {
  /** Title text. Omit and use the `title` slot for richer content. */
  title?: string;
  /** Plain-text note on the right. For a control, use the `note` slot. */
  note?: string;
  /** Element for the title. `span` avoids a duplicate heading in the outline. */
  as?: "h2" | "h3" | "span";
  /** Note colour: a muted caption, or the live accent for a "now" scope. */
  tone?: "muted" | "live";
}
withDefaults(defineProps<Props>(), { as: "h3", tone: "muted" });
</script>

<template>
  <div class="card-header">
    <component :is="as" v-if="title || $slots.title" class="card-header__title">
      <slot name="title">{{ title }}</slot>
    </component>
    <slot name="note">
      <span v-if="note" class="card-header__note" :class="`is-${tone}`">{{ note }}</span>
    </slot>
  </div>
</template>

<style scoped>
.card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-12);
  margin-bottom: var(--sp-14);
}
.card-header__title {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h3);
  color: var(--ink-strong);
}
.card-header__note {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
}
.card-header__note.is-muted {
  color: var(--muted);
}
.card-header__note.is-live {
  color: var(--live-ink);
}
</style>
