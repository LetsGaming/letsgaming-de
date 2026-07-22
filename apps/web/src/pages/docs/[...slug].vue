<script setup lang="ts">
/**
 * One rendered doc inside the shared docs shell.
 *
 * The article is server-rendered HTML (`marked` output from `server/utils/docs`),
 * injected with `v-html` — it's our own repo's markdown, not user input, and it's
 * rendered on the server where the link rewrite runs. Prerendered by the route
 * rule in nuxt.config, so in production these are static files; SSR remains the
 * fallback if a crawl misses one.
 */
import DocsShell from "~/components/docs/DocsShell.vue";

const route = useRoute();
const slug = computed(() =>
  (Array.isArray(route.params.slug) ? route.params.slug.join("/") : route.params.slug ?? "").toLowerCase(),
);

const { data, error } = await useFetch(() => `/api/docs/${slug.value}`);
if (error.value) throw createError({ statusCode: 404, statusMessage: "No such doc." });

useHead(() => ({ title: `${data.value?.title ?? "Docs"} — letsgaming.de docs` }));
</script>

<template>
  <DocsShell v-if="data" :tree="data.tree" :active="data.slug">
    <article class="doc-body prose" v-html="data.html" />
  </DocsShell>
</template>
