<script setup lang="ts">
/**
 * Every area except the first. Static routes (`/docs`, `/datenschutz`) are more
 * specific and win, so this only catches area segments and unknown paths.
 *
 * A hidden area 404s here without a guard of its own: the resolver strips drafts
 * from `site.nav`, so `areaById` can't find one and this throws. That's what makes
 * `hidden` a fact rather than a flag — the router enforces it.
 */
import { areaById } from "~/lib/area";
import AreaPage from "~/components/shell/AreaPage.vue";

const route = useRoute();
const areaId = String(route.params.area ?? "");

const { data } = await useFetch("/api/site", {
  query: { lang: route.query.lang },
});

const site = data.value?.site;
if (site) {
  // The first area is canonical at `/` — permanent, so the redirect is cached.
  if (areaId === site.nav[0]?.id) {
    await navigateTo("/", { redirectCode: 308 });
  } else if (!areaById(site.nav, areaId)) {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }
}
</script>

<template>
  <AreaPage v-if="data" :site="data.site" :locale="data.locale" :area="areaId" />
</template>
