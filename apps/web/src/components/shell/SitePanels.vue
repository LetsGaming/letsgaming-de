<script setup lang="ts">
import type { NavView, SiteView } from "@lg/core";
import { computed, nextTick, onMounted } from "vue";
import { useSiteState } from "../../composables/useSiteState";
import Module from "./Module.vue";

const props = defineProps<{ site: SiteView; area: string }>();

const current = computed<NavView | undefined>(() => props.site.nav.find((a) => a.id === props.area));

/** Modules this area places, in order (skips missing ids defensively). */
const modules = computed(() =>
  (current.value?.modules ?? []).map((id) => props.site.modules[id]).filter(Boolean),
);

onMounted(() => {
  useSiteState().initSite(props.site.nav);
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
