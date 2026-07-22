<script setup lang="ts">
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";

const { t } = useT();
defineProps<{
  module: Extract<ResolvedModule, { kind: "posts" }>;
}>();
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <ul v-if="module.data.posts.length" class="posts">
      <li v-for="p in module.data.posts" :key="p.slug" class="post">
        <SmartLink :href="`/md/${p.slug}`" class="post-t">{{ p.title }}</SmartLink>
        <p v-if="p.excerpt" class="post-x">{{ p.excerpt }}</p>
        <p class="post-m">
          <time :datetime="p.at">{{ p.relative }} ago</time>
          <!-- Tags are display-only: chips, not links. Tag pages would need
               routes and an area, and the nav is at its breadth cap. -->
          <span v-for="t in p.tags" :key="t" class="tag">{{ t }}</span>
        </p>
      </li>
    </ul>
    <p v-else class="sub">{{ t("emptyPosts") }}</p>
  </ModuleSection>
</template>

<style scoped>
/* Post list, scoped. `.tag` and `.sub` stay global — shared chips/typography. */
.posts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-20);
}
.post {
  padding-bottom: var(--sp-20);
  border-bottom: 1px solid var(--line-1);
}
.post:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.post-t {
  font-family: var(--f-d);
  font-size: var(--fs-h3);
  color: var(--ink-strong);
  text-decoration: none;
}
.post-t:hover {
  text-decoration: underline;
}
.post-x {
  color: var(--muted);
  margin: var(--sp-4) 0 var(--sp-6);
}
.post-m {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: var(--sp-8);
}
</style>
