<script setup lang="ts">
import type { NavView, SiteView } from "@lg/core";
import { computed, nextTick, onMounted } from "vue";
import { initSite } from "../../stores/site";
import Module from "./Module.vue";

const props = defineProps<{ site: SiteView; area: string }>();

const current = computed<NavView | undefined>(() => props.site.nav.find((a) => a.id === props.area));

/** Modules this area places, in order (skips missing ids defensively). */
const modules = computed(() =>
  (current.value?.modules ?? []).map((id) => props.site.modules[id]).filter(Boolean),
);

/**
 * Navigate to an area.
 *
 * Still a prop, still wrong — this is `<a href>` with the useful parts removed
 * (no middle-click, no ctrl-click, no "copy link address", nothing for a crawler
 * to follow). Two sections use it, for a "more" button. Fixing it properly means
 * the resolver handing those modules a `moreHref`, the way it now hands the hero's
 * links real URLs. Next tranche; `goAnchor` was the same shape and went first
 * because it was hiding a dead CTA.
 */

onMounted(() => {
  initSite(props.site.nav);
  // Deep link within this area. Cross-area hashes don't need handling any more:
  // the area is the URL, so the server already sent the right page.
  const target = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  if (target) {
    void nextTick(() =>
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
});
</script>

<template>
  <section class="panel">
    <Module v-for="m in modules" :key="m!.id" :module="m!" />
  </section>
</template>
