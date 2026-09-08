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
import Breadcrumbs, { type Crumb } from "~/components/ui/Breadcrumbs.vue";
import { breadcrumbLd, plainExcerpt } from "@lg/core";
import { useSeo } from "~/composables/useSeo";
import { useRuntimeConfig } from "#imports";

const route = useRoute();
const slug = computed(() =>
  (Array.isArray(route.params.slug) ? route.params.slug.join("/") : route.params.slug ?? "").toLowerCase(),
);

const { data, error } = await useFetch<{ title: string; html: string; slug: string; tree: DocGroup[] }>(
  () => `/api/docs/${slug.value}`,
);
if (error.value) throw createError({ statusCode: 404, statusMessage: "No such doc." });

const origin = (useRuntimeConfig().public.siteUrl as string).replace(/\/$/, "");
const canonicalPath = computed(() => `/docs/${slug.value}`);

// The doc's own group ("ADR", "Concepts"…), for the trail — "Overview" is the
// root group's placeholder label, not a real section, so it's left out rather
// than shown as a crumb that names nothing.
const group = computed(() => data.value?.tree.find((g) => g.items.some((it) => it.slug === data.value?.slug)));
const crumbs = computed<Crumb[]>(() => [
  { label: "letsgaming.de", href: "/" },
  { label: "Documentation", href: "/docs" },
  ...(group.value && group.value.label !== "Overview" ? [{ label: group.value.label }] : []),
  { label: data.value?.title ?? "Docs" },
]);

// Docs are English-only repo markdown, prerendered — no `localized`, because
// `?lang=de` serves the same words and claiming an alternate would be a false
// hreflang. No site graphs either: these are documents, not the site itself.
useSeo({
  locale: "en",
  path: canonicalPath.value,
  title: `${data.value?.title ?? "Docs"} — letsgaming.de docs`,
  description: plainExcerpt(data.value?.html ?? "") || `${data.value?.title ?? "Documentation"} — letsgaming.de documentation.`,
  // Only crumbs with a real URL become `ListItem`s — the group label has no page
  // of its own, so it's a visual-only crumb and sits out of the graph.
  jsonLd: [
    breadcrumbLd([
      { name: "letsgaming.de", url: origin },
      { name: "Documentation", url: `${origin}/docs` },
      { name: data.value?.title ?? "Docs", url: `${origin}${canonicalPath.value}` },
    ]),
  ],
});
</script>

<template>
  <DocsShell v-if="data" :tree="data.tree" :active="data.slug">
    <!-- One element in the default slot, not two: `.doc-wrap` is a two-column
         grid with the sidebar as column 1's only item, so a second top-level
         child here would auto-place into column 1's *next row* — under the
         sidebar — instead of alongside it in column 2. -->
    <div class="doc-main">
      <Breadcrumbs :items="crumbs" />
      <article class="doc-body prose" v-html="data.html" />
    </div>
  </DocsShell>
</template>
