<script setup lang="ts">
// The first area is the site root. `/home` doesn't also exist — one canonical URL.
import type { Locale, SiteView } from "@lg/core";
import AreaPage from "~/components/shell/AreaPage.vue";
import { useRequestLang } from "~/composables/useSiteRequest";

// Resolved server-side (in-process during SSR, so no HTTP hop on a page render).
// `lang` is forwarded so an explicit ?lang choice still wins over Accept-Language,
// and so a client-side tab switch keeps the language the visitor is reading in.
const { data } = await useFetch<{ locale: Locale; site: SiteView }>("/api/site", {
  query: { lang: useRequestLang() },
});
</script>

<template>
  <AreaPage v-if="data" :site="data.site" :locale="data.locale" />
</template>
