<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";

defineProps<{
  module: Extract<ResolvedModule, { kind: "posts" }>;
  go: (id: string) => void;
}>();
</script>

<template>
  <section :id="module.id" class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
    </div>
    <ul v-if="module.data.posts.length" class="posts">
      <li v-for="p in module.data.posts" :key="p.slug" class="post">
        <a :href="`/md/${p.slug}`" class="post-t">{{ p.title }}</a>
        <p v-if="p.excerpt" class="post-x">{{ p.excerpt }}</p>
        <p class="post-m">
          <time :datetime="p.at">{{ p.relative }} ago</time>
          <!-- Tags are display-only: chips, not links. Tag pages would need
               routes and an area, and the nav is at its breadth cap. -->
          <span v-for="t in p.tags" :key="t" class="tag">{{ t }}</span>
        </p>
      </li>
    </ul>
    <p v-else class="sub">Nothing published yet.</p>
  </section>
</template>
