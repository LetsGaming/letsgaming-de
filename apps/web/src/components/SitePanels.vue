<script setup lang="ts">
import type { NavView, SiteView } from "@lg/core";
import { computed, nextTick, onMounted } from "vue";
import { areaHref, targetHref } from "../lib/area";
import { initSite } from "../stores/site";
import Module from "./Module.vue";

const props = defineProps<{ site: SiteView; area: string }>();

const current = computed<NavView | undefined>(() => props.site.nav.find((a) => a.id === props.area));

/** Modules this area places, in order (skips missing ids defensively). */
const modules = computed(() =>
  (current.value?.modules ?? []).map((id) => props.site.modules[id]).filter(Boolean),
);

/** Was a tab switch; now it's navigation. Kept as a prop on every section so the
 *  14 components' signatures don't change — the destination is a URL now. */
function go(id: string) {
  if (typeof window !== "undefined") window.location.assign(areaHref(props.site.nav, id));
}

/** An in-page target on another area is a cross-area link; on this one it's a
 *  scroll. Powers `#contact` from the hero, which used to switch tabs. */
function goToAnchor(target: string) {
  if (typeof window === "undefined") return;
  const here = (current.value?.modules ?? []).includes(target);
  if (!here) {
    window.location.assign(targetHref(props.site.nav, target));
    return;
  }
  void nextTick(() =>
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}

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
    <Module v-for="m in modules" :key="m!.id" :module="m!" :go="go" :go-anchor="goToAnchor" />
  </section>
</template>
