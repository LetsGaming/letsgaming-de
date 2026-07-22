<script setup lang="ts">
/**
 * The docs shell: mobile topbar, slide-in drawer, and the section sidebar.
 *
 * This markup was copy-pasted between the two docs routes (the doc page and the
 * API reference) — the exact duplication the migration is meant to stop. It lives
 * here once; both routes render `<DocsShell>` and put their article in the slot.
 *
 * The drawer is Vue state rather than the previous `data-doc-open` /
 * `data-doc-close` / `data-doc-scrim` attributes driven by a separate DOM script.
 * Same behaviour, but the open state is owned by the component that renders it, so
 * there's nothing to keep in sync and no query selector to break when the markup
 * moves. Route changes close it, since navigating is the point of tapping a link.
 */
import { ref, watch } from "vue";
import type { DocGroup } from "~/lib/docs";
import SmartLink from "~/components/ui/SmartLink.vue";

defineProps<{
  tree: DocGroup[];
  /** Slug of the doc being shown, so its sidebar entry can mark itself current. */
  active: string;
}>();

const open = ref(false);
watch(() => useRoute().fullPath, () => (open.value = false));
</script>

<template>
  <div class="doc-wrap">
    <!-- Mobile-only bar: opens the docs nav as a drawer so the section list
         doesn't push the article down the page. Desktop shows the sidebar. -->
    <header class="doc-topbar">
      <span class="doc-tt">Documentation</span>
      <button class="burger" type="button" aria-label="Open docs menu" @click="open = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
    </header>

    <div class="doc-scrim" :class="{ on: open }" @click="open = false" />

    <aside class="doc-nav" :class="{ on: open }" id="doc-nav" aria-label="Documentation">
      <div class="doc-navhead">
        <SmartLink class="doc-home" href="/">← letsgaming.de</SmartLink>
        <button class="burger doc-close" type="button" aria-label="Close docs menu" @click="open = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div v-for="group in tree" :key="group.label" class="doc-group">
        <h4>{{ group.label }}</h4>
        <ul>
          <li v-for="it in group.items" :key="it.slug">
            <SmartLink :href="`/docs/${it.slug}`" :class="it.slug === active ? 'on' : undefined">
              {{ it.title }}
            </SmartLink>
          </li>
        </ul>
      </div>
      <!-- The API reference appends its in-page jump list here; the markdown docs
           pass nothing and the sidebar ends after the groups. -->
      <slot name="nav-extra" />
    </aside>

    <slot />
  </div>
</template>
