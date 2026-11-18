<script setup lang="ts">
import { useT } from "~/composables/useT";
import { reactive } from "vue";
import type { ResolvedModule } from "@lg/core";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import Freshness from "../ui/Freshness.vue";
import { langColor } from "../../lib/icons";
import { presenceMediaUrl } from "../../lib/api";
import { isGeneratedRepoCard } from "../../lib/repoPreview";
import { trackClick, trackProject } from "../../lib/track";

const { t } = useT();
defineProps<{
  module: Extract<ResolvedModule, { kind: "featured" }>;
}>();

/** Repos whose preview image failed to load; they fall back to the placeholder. */
const broken = reactive(new Set<string>());

/** Through the server's media proxy, so the visitor's browser never contacts GitHub's
 *  CDN directly and the server's cache serves the image. */
const shot = (url: string, theme?: "dark") => presenceMediaUrl({ url, ...(theme ? { theme } : {}) });

function open(name: string) {
  trackClick("featured");
  trackProject(name);
}
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" gap="group">
    <template #note>
      <Freshness :freshness="module.data.freshness" />
      <SmartLink class="more" :href="module.data.moreHref" @click="() => trackClick('project-more')">{{ t("seeAllWork") }}</SmartLink>
    </template>
    <template v-if="module.data.projects.length">
      <template v-for="(p, i) in module.data.projects" :key="p.id">
        <SmartLink v-if="i === 0" class="lead" :href="p.href" @click="open(p.name)">
          <div class="shot">
            <template v-if="p.image && !broken.has(p.id)">
              <!-- GitHub's generated card is white; the server has a dark version of it.
                   Both are in the page and the theme decides which one is displayed, so
                   there is no flash on first paint. A hidden lazy image is not fetched. -->
              <template v-if="isGeneratedRepoCard(p.image)">
                <img class="theme-light" :src="shot(p.image)" alt="" loading="lazy" decoding="async" @error="broken.add(p.id)" />
                <img class="theme-dark" :src="shot(p.image, 'dark')" alt="" loading="lazy" decoding="async" @error="broken.add(p.id)" />
              </template>
              <img v-else :src="shot(p.image)" alt="" loading="lazy" decoding="async" @error="broken.add(p.id)" />
            </template>
            <span v-else class="ph" aria-hidden="true">{{ p.name.slice(0, 1) }}</span>
          </div>
          <div class="body">
            <h3 class="name" :title="p.name">{{ p.name }}</h3>
            <p v-if="p.tag || p.featured" class="facts">
              <span v-if="p.tag" class="lang"><span class="ldot" :style="{ background: langColor(p.tag) }" />{{ p.tag }}</span>
              <span v-if="p.featured">{{ t("featuredPinned") }}</span>
            </p>
            <p v-if="p.description" class="desc">{{ p.description }}</p>
            <p v-if="p.meta.length" class="meta"><span v-for="(m, j) in p.meta" :key="j">{{ m }}</span></p>
          </div>
        </SmartLink>
      </template>
      <ul v-if="module.data.projects.length > 1" class="rows">
        <li v-for="p in module.data.projects.slice(1)" :key="p.id">
          <SmartLink class="prow" :href="p.href" @click="open(p.name)">
            <span class="prow-name" :title="p.name">{{ p.name }}</span>
            <span v-if="p.tag" class="lang"><span class="ldot" :style="{ background: langColor(p.tag) }" />{{ p.tag }}</span>
            <span v-if="p.featured" class="pinned">{{ t("featuredPinned") }}</span>
            <span v-if="p.description" class="prow-desc">{{ p.description }}</span>
          </SmartLink>
        </li>
      </ul>
    </template>
    <p v-else class="sub">{{ t("emptyFeatured") }}</p>
  </ModuleSection>
</template>

<style scoped>
.lead {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  color: inherit;
  text-decoration: none;
}
@container (min-width: 720px) {
  .lead {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: var(--space-6);
    align-items: end;
  }
}
.shot {
  position: relative;
  aspect-ratio: 2 / 1;
  overflow: hidden;
  border-radius: var(--r-2);
  background: var(--surf-2);
}
.shot img,
.ph {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.shot img.theme-light {
  display: var(--shot-light-display);
}
.shot img.theme-dark {
  display: var(--shot-dark-display);
}
.ph {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-family: var(--f-d);
  font-size: var(--fs-figure);
  font-weight: 600;
  color: var(--muted);
  background: var(--surf-2);
}
.body {
  min-width: 0;
}
.name {
  margin: 0;
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h1);
  line-height: 1.1;
  color: var(--ink-strong);
  overflow-wrap: anywhere;
}
.lead:hover .name,
.lead:focus-visible .name,
.prow:hover .prow-name,
.prow:focus-visible .prow-name {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
.facts,
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  margin: var(--space-2) 0 0;
  font-size: var(--fs-small);
  color: var(--muted);
}
.lang {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
.ldot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: var(--r-round);
}
.desc {
  margin: var(--space-3) 0 0;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.meta {
  font-size: var(--fs-meta);
}

.rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
  gap: var(--space-3) var(--space-6);
  margin: var(--space-6) 0 0;
  padding: 0;
  list-style: none;
}
.prow {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: var(--space-3);
  row-gap: var(--space-1);
  min-height: 24px;
  padding: var(--space-1) 0;
  color: inherit;
  text-decoration: none;
  font-size: var(--fs-small);
}
.prow-name {
  font-size: var(--fs-h3);
  font-weight: 600;
  color: var(--ink-strong);
  overflow-wrap: anywhere;
}
.prow .lang,
.prow .pinned {
  color: var(--muted);
}
.prow-desc {
  flex: 1 0 100%;
  min-width: 0;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
