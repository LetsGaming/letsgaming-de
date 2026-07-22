<script setup lang="ts">
// The first area is the site root. `/home` doesn't also exist — one canonical URL.
import AreaPage from "~/components/shell/AreaPage.vue";

const route = useRoute();
// Resolved server-side (in-process during SSR, so no HTTP hop on a page render).
// `lang` is forwarded so an explicit ?lang choice still wins over Accept-Language.
const { data } = await useFetch("/api/site", {
  query: { lang: route.query.lang },
});
</script>

<template>
  <AreaPage v-if="data" :site="data.site" :locale="data.locale" />
</template>
