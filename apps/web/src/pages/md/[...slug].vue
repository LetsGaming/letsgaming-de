<script setup lang="ts">
/**
 * Runtime-rendered Markdown asset (the blog). The slug is the full path under
 * /md, so a post namespaced as `blog/my-post` resolves here without a second
 * route. The markdown comes from the API — these are CMS-managed, not repo files.
 *
 * `preview` is forwarded, not validated here: the API owns that decision, so this
 * page can't become a second, laxer gate on the same secret.
 */
import SmartLink from "~/components/ui/SmartLink.vue";

interface MdDoc { title: string; draft: boolean; html: string }

const route = useRoute();
const slug = computed(() =>
  Array.isArray(route.params.slug) ? route.params.slug.join("/") : route.params.slug ?? "",
);

const { data } = await useFetch<MdDoc>(() => `/api/md/${slug.value}`, {
  query: { preview: route.query.preview },
});
if (!data.value) throw createError({ statusCode: 404, statusMessage: "Not found" });

useHead(() => ({ title: data.value?.title ?? "Not found" }));
</script>

<template>
  <main v-if="data" class="md-wrap">
    <SmartLink class="md-home" href="/blog">← Blog</SmartLink>
    <p v-if="data.draft" class="md-draft">Draft — visible via preview link only.</p>
    <article class="prose" v-html="data.html" />
  </main>
</template>
