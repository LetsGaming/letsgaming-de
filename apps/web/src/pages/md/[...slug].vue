<script setup lang="ts">
/**
 * Runtime-rendered Markdown asset (the blog). The slug is the full path under
 * /md, so a post namespaced as `blog/my-post` resolves here without a second
 * route. The markdown comes from the API — these are CMS-managed, not repo files.
 *
 * `preview` is forwarded, not validated here: the API owns that decision, so this
 * page can't become a second, laxer gate on the same secret.
 */
import Breadcrumbs, { type Crumb } from "~/components/ui/Breadcrumbs.vue";
import { articleLd, breadcrumbLd, type Locale, type SiteView } from "@lg/core";
import { useSeo } from "~/composables/useSeo";
import { useRuntimeConfig } from "#imports";

interface MdDoc {
  title: string;
  draft: boolean;
  html: string;
  /** ISO publication date from the post's frontmatter; absent if it has none. */
  at?: string;
  excerpt: string;
  tags: string[];
}

const route = useRoute();
const slug = computed(() =>
  Array.isArray(route.params.slug) ? route.params.slug.join("/") : route.params.slug ?? "",
);

const { data } = await useFetch<MdDoc>(() => `/api/md/${slug.value}`, {
  query: { preview: route.query.preview },
});
if (!data.value) throw createError({ statusCode: 404, statusMessage: "Not found" });

// The site is loaded for its identity, not its content: a post's byline and the
// Person graph need the owner's name and handle. It's an in-process, 15s-cached
// local read during SSR, so this costs a page render essentially nothing.
const { data: siteData } = await useFetch<{ locale: Locale; site: SiteView }>("/api/site");

const origin = (useRuntimeConfig().public.siteUrl as string).replace(/\/$/, "");
const canonicalPath = computed(() => `/md/${slug.value}`);

// The excerpt is the post's own — its `excerpt:` frontmatter, or its first
// paragraph — resolved server-side by the same `parsePost`/`firstParagraph` the
// posts list uses, so a post's description matches its blurb on the index.
const description = computed(() => data.value?.excerpt || siteData.value?.site.meta.role || "");

// "Blog" has no `href`: there's no index page listing every post (see
// PostsSection — an area's `posts` module shows its own recent list, not an
// archive), so a link there would be dead. It still names the section a
// visitor is in; wire it to a real route if/when a blog index exists.
const crumbs = computed<Crumb[]>(() => [
  { label: "letsgaming.de", href: "/" },
  { label: "Blog" },
  { label: data.value?.title ?? "Post" },
]);

useSeo({
  locale: siteData.value?.locale ?? "en",
  path: canonicalPath.value,
  title: `${data.value?.title ?? "Not found"} — ${siteData.value?.site.meta.name ?? "letsgaming.de"}`,
  description: description.value,
  ogType: "article",
  // Deliberately not `localized`: a post is written in one language, and `?lang`
  // doesn't translate it. Claiming alternates here would be a false hreflang.
  jsonLd: data.value
    ? [
        articleLd({
          headline: data.value.title,
          url: `${origin}${canonicalPath.value}`,
          // Omitted rather than invented when a post carries no date: a
          // `datePublished` of "now" would change on every render.
          datePublished: data.value.at,
          description: description.value,
          keywords: data.value.tags,
          image: `${origin}/og-image.png`,
          author: {
            name: siteData.value?.site.meta.name ?? "",
            url: origin,
          },
        }),
        // "Blog" is left out here too — `BreadcrumbList` items need a real URL,
        // and inventing one would tell Google a page exists that doesn't.
        breadcrumbLd([
          { name: "letsgaming.de", url: origin },
          { name: data.value.title, url: `${origin}${canonicalPath.value}` },
        ]),
      ]
    : [],
});
</script>

<template>
  <main v-if="data" class="md-wrap">
    <Breadcrumbs :items="crumbs" />
    <p v-if="data.draft" class="md-draft">Draft — visible via preview link only.</p>
    <h1>{{ data.title }}</h1>
    <article class="prose" v-html="data.html" />
  </main>
</template>
