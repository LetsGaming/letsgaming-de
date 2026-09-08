<script setup lang="ts">
import type { NavView, SiteView } from "@lg/core";
import { computed, nextTick, onMounted } from "vue";
import { useSiteState } from "../../composables/useSiteState";
import { useT } from "~/composables/useT";
import Module from "./Module.vue";

const props = defineProps<{ site: SiteView; area: string }>();
const { t } = useT();

const current = computed<NavView | undefined>(() => props.site.nav.find((a) => a.id === props.area));

/** Modules this area places, in order (skips missing ids defensively). */
const modules = computed(() =>
  (current.value?.modules ?? []).map((id) => props.site.modules[id]).filter(Boolean),
);

/**
 * How many placed modules are cold (never synced / synced-but-empty). Below
 * COLD_START_THRESHOLD, each module's own Freshness caption already says so —
 * that's honest and specific. At or above it, reading N separate "nothing
 * here"s in a row reads as broken rather than honest, so one line up front
 * reframes the page before the individual captions repeat the point.
 */
const COLD_START_THRESHOLD = 3;
const coldModuleCount = computed(
  () =>
    modules.value.filter((m) => {
      const freshness = m && "freshness" in m.data ? m.data.freshness : undefined;
      return freshness?.state === "never" || freshness?.state === "empty";
    }).length,
);
const showColdStart = computed(() => coldModuleCount.value >= COLD_START_THRESHOLD);

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
    <p v-if="showColdStart" class="cold-start">{{ t("coldStart") }}</p>
    <Module v-for="m in modules" :key="m!.id" :module="m!" />
  </section>
</template>

<style scoped>
/* .module-section:first-child normally carries the tight --sp-8 gap from the
   top nav; once this banner is the actual first child, that gap belongs here
   instead, and the first module falls back to the ordinary --sp-section
   rhythm as if the banner were just another module before it. */
.cold-start {
  margin-top: var(--sp-8);
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
}
</style>
