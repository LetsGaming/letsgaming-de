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
import type { DocGroup } from "~/lib/docs";
import DocsShell from "~/components/docs/DocsShell.vue";
import { plainExcerpt } from "@lg/core";
import { useSeo } from "~/composables/useSeo";

const route = useRoute();
const slug = computed(() =>
  (Array.isArray(route.params.slug) ? route.params.slug.join("/") : route.params.slug ?? "").toLowerCase(),
);

const { data, error } = await useFetch<{ title: string; html: string; slug: string; tree: DocGroup[] }>(
  () => `/api/docs/${slug.value}`,
);
if (error.value) throw createError({ statusCode: 404, statusMessage: "No such doc." });

// Docs are English-only repo markdown, prerendered — no `localized`, because
// `?lang=de` serves the same words and claiming an alternate would be a false
// hreflang. No site graphs either: these are documents, not the site itself.
useSeo({
  locale: "en",
  path: `/docs/${slug.value}`,
  title: `${data.value?.title ?? "Docs"} — letsgaming.de docs`,
  description: plainExcerpt(data.value?.html ?? "") || `${data.value?.title ?? "Documentation"} — letsgaming.de documentation.`,
});
</script>

<template>
  <DocsShell v-if="data" :tree="data.tree" :active="data.slug">
    <article class="doc-body prose" v-html="data.html" />
  </DocsShell>
</template>
