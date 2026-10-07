<script setup lang="ts">
import { useT } from "~/composables/useT";
import { reactive } from "vue";
import type { ResolvedModule } from "@lg/core";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import Freshness from "../ui/Freshness.vue";
import { langColor, icons } from "../../lib/icons";
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
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note>
      <Freshness :freshness="module.data.freshness" />
      <SmartLink class="more" :href="module.data.moreHref" @click="() => trackClick('project-more')">{{ t("seeAllWork") }}</SmartLink>
    </template>
    <div v-if="module.data.projects.length" class="featured" :class="`n${module.data.projects.length}`">
      <SmartLink
        v-for="p in module.data.projects"
        :key="p.id"
        class="fcard"
        :href="p.href"
        @click="open(p.name)"
      >
        <div class="shot">
          <template v-if="p.image && !broken.has(p.id)">
            <!-- GitHub's generated card is white; the server has a dark version of it.
                 Both are in the page and the theme decides which one is displayed, so
                 there is no flash on first paint. A hidden lazy image is not fetched. -->
            <template v-if="isGeneratedRepoCard(p.image)">
              <img
                class="theme-light"
                :src="shot(p.image)"
                alt=""
                loading="lazy"
                decoding="async"
                @error="broken.add(p.id)"
              />
              <img
                class="theme-dark"
                :src="shot(p.image, 'dark')"
                alt=""
                loading="lazy"
                decoding="async"
                @error="broken.add(p.id)"
              />
            </template>
            <img v-else :src="shot(p.image)" alt="" loading="lazy" decoding="async" @error="broken.add(p.id)" />
          </template>
          <span v-else class="ph" aria-hidden="true">{{ p.name.slice(0, 1) }}</span>
          <span v-if="p.featured" class="badge">{{ t("featuredPinned") }}</span>
        </div>
        <div class="body">
          <div class="ptitle">{{ p.name }}<span class="arrow" v-html="icons.arrow" /></div>
          <span v-if="p.tag" class="tag" :style="{ color: langColor(p.tag), borderColor: langColor(p.tag) }">{{ p.tag }}</span>
          <p v-if="p.description" class="desc">{{ p.description }}</p>
          <div class="meta"><span v-for="(m, i) in p.meta" :key="i">{{ m }}</span></div>
        </div>
      </SmartLink>
    </div>
    <p v-else class="sub">{{ t("emptyFeatured") }}</p>
  </ModuleSection>
</template>

<style scoped>
/* The grid answers to the section's own width (ModuleSection is the query
 * container), not the viewport, so the cards behave the same in the editor's
 * narrower canvas as on a phone. */
.featured {
  display: grid;
  gap: var(--sp-18);
  grid-template-columns: 1fr;
}
@container (min-width: 560px) {
  .featured.n2,
  .featured.n3 {
    grid-template-columns: repeat(2, 1fr);
  }
  .featured.n1 .fcard {
    flex-direction: row;
  }
  .featured.n1 .shot {
    width: 45%;
    aspect-ratio: auto;
    min-height: 100%;
  }
}
@container (min-width: 860px) {
  .featured.n3 {
    grid-template-columns: repeat(3, 1fr);
  }
}

.fcard {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surf-1);
  border: 1px solid var(--line-1);
  border-radius: var(--r-card);
  box-shadow: var(--sh-card);
  color: inherit;
  text-decoration: none;
  transition:
    box-shadow 0.3s ease,
    border-color 0.3s ease;
}
.fcard:hover {
  box-shadow: var(--sh-anchor);
  border-color: var(--line-2);
}

.shot {
  position: relative;
  aspect-ratio: 2 / 1;
  background: var(--surf-2);
  flex-shrink: 0;
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
  font-size: 48px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--muted);
  background: linear-gradient(135deg, var(--surf-2), var(--surf-3));
}
.badge {
  position: absolute;
  top: var(--sp-10);
  left: var(--sp-10);
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  font-weight: 700;
  padding: var(--sp-4) var(--sp-10);
  border-radius: 999px;
  background: var(--surf-1);
  color: var(--ink-strong);
  border: 1px solid var(--line-2);
}

.body {
  padding: var(--sp-18) var(--sp-20) var(--sp-20);
  min-width: 0;
  flex: 1;
}
.ptitle {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: clamp(18px, 2.4vw, 22px);
  letter-spacing: -0.01em;
  margin-bottom: var(--sp-8);
  display: flex;
  align-items: center;
  gap: var(--sp-10);
  color: var(--ink-strong);
  min-width: 0;
  overflow-wrap: anywhere;
}
.arrow {
  margin-left: auto;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--surf-2);
  display: grid;
  place-items: center;
  transition: transform 0.2s ease;
}
.fcard:hover .arrow {
  transform: translateX(3px) rotate(-45deg);
}
.arrow :deep(svg) {
  width: 14px;
  height: 14px;
  color: var(--ink);
}
.desc {
  color: var(--muted);
  font-size: var(--fs-body);
  margin: var(--sp-10) 0 var(--sp-12);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta {
  color: var(--muted);
  font-size: var(--fs-micro);
}
</style>
