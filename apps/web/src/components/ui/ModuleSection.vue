<script setup lang="ts">
/**
 * The outer shell every module shares: an anchored <section>, a heading, and an
 * optional note beside it — a synced-age <Freshness>, a plain caption, or a live
 * "scope". This replaces the `.sec` + `.sec-head` markup that was hand-repeated in
 * fourteen sections, and the divergent `.mu-head` / `.pt-head` in the other two.
 * One heading rhythm and one head layout now serve all of them (which is also how
 * Listening and Time-played finally get the same inter-section gap as their
 * siblings — as `.mu` / `.pt` they had none).
 *
 * `container-type: inline-size` makes the section a query container, which is what
 * the StatTiles in Listening / Time-played size against. It's inert everywhere else.
 */
interface Props {
  /** Anchor id — drives in-page nav and the editor canvas's module mapping. */
  id: string;
  /** The section heading, as resolved for the current locale. */
  heading: string;
  /**
   * A plain-text caption beside the heading. For a component note (a Freshness
   * badge, a segmented control), use the `note` slot instead of this prop.
   */
  note?: string;
}
defineProps<Props>();
</script>

<template>
  <section :id="id" class="module-section">
    <header class="module-section__head">
      <h2 class="module-section__title">{{ heading }}</h2>
      <slot name="note">
        <span v-if="note" class="module-section__note">{{ note }}</span>
      </slot>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.module-section {
  container-type: inline-size;
  margin-top: var(--sp-section);
}
.module-section:first-child {
  margin-top: var(--sp-8);
}
.module-section__head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-12);
  margin-bottom: var(--sp-22);
}
.module-section__title {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-section);
  letter-spacing: -0.01em;
  color: var(--ink-strong);
}
.module-section__note {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
}
/* A trailing action passed in the note slot — the "see all →" / "all repos →"
   links Featured and Projects put beside the heading — sits at the far right. */
.module-section__head :slotted(.more) {
  margin-left: auto;
}
</style>
