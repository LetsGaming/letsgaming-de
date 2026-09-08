<script setup lang="ts">
/**
 * The trail above a doc/post's content: Home › Docs › ADR › the current page.
 *
 * Public on `/docs/*` and `/md/*` — the two route families with a real,
 * navigable parent chain (a doc's group, a post's section). Areas don't get
 * one: they're siblings under one tab strip, not a hierarchy, and `SiteChrome`
 * already shows where you are.
 *
 * The `BreadcrumbList` JSON-LD a search result renders from is a separate
 * concern — built with `breadcrumbLd` from `@lg/core` and passed to `useSeo`'s
 * `jsonLd` by the page, which is the one place that already knows the site's
 * origin. This component only owns what a visitor sees.
 */
import SmartLink from "./SmartLink.vue";

export interface Crumb {
  label: string;
  /** Omitted for a crumb with nowhere to send you (e.g. no blog index exists
   *  yet) — it renders as plain text instead of a dead link. */
  href?: string;
}

defineProps<{
  /** In order, root first. The last crumb is the current page and is never a
   *  link, regardless of whether it carries an `href`. */
  items: Crumb[];
}>();
</script>

<template>
  <nav class="crumbs" aria-label="Breadcrumb">
    <ol>
      <li v-for="(item, i) in items" :key="i">
        <SmartLink v-if="item.href && i < items.length - 1" :href="item.href">{{ item.label }}</SmartLink>
        <span v-else :aria-current="i === items.length - 1 ? 'page' : undefined">{{ item.label }}</span>
        <span v-if="i < items.length - 1" class="crumbs-sep" aria-hidden="true">/</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
/* Label scale (Space Mono, 12px, muted) — the same typographic register as a
 * synced timestamp: wayfinding metadata, not prose, and not a heading. */
.crumbs ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-6);
  list-style: none;
  margin: 0 0 var(--sp-16);
  padding: 0;
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
}
.crumbs li {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
}
.crumbs :deep(a) {
  color: var(--muted);
  text-decoration: none;
}
.crumbs :deep(a:hover) {
  color: var(--ink);
  text-decoration: underline;
}
.crumbs span[aria-current="page"] {
  color: var(--ink);
}
.crumbs-sep {
  color: var(--muted);
  opacity: 0.6;
}
</style>
