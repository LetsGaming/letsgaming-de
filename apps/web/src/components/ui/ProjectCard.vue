<script setup lang="ts">
/**
 * A project as one table row: name, description, language, updated. The whole row
 * is the link. Pinned rows also carry a small screenshot thumbnail.
 *
 * It takes the resolved `ProjectView` whole, so a field added to the contract lands
 * here without touching the caller.
 */
import { ref } from "vue";
import type { ClickAction, ProjectView } from "@lg/core";
import { langColor } from "../../lib/icons";
import { presenceMediaUrl } from "../../lib/api";
import { isGeneratedRepoCard } from "../../lib/repoPreview";
import { trackClick, trackProject } from "../../lib/track";
import { useT } from "~/composables/useT";
import SmartLink from "./SmartLink.vue";

const { t } = useT();

interface Props {
  project: ProjectView;
  /** Analytics label for the click ("project" / "featured"). */
  event: ClickAction;
}
const props = defineProps<Props>();

const broken = ref(false);

/** Through the server's media proxy, so the visitor's browser never contacts GitHub's CDN. */
const shot = (url: string, theme?: "dark") => presenceMediaUrl({ url, ...(theme ? { theme } : {}) });

function onClick() {
  trackClick(props.event);
  trackProject(props.project.name);
}
</script>

<template>
  <SmartLink class="prow" :class="{ pinned: project.featured }" :href="project.href" @click="onClick">
    <span class="p-name">
      <span v-if="project.featured" class="p-shot" aria-hidden="true">
        <template v-if="project.image && !broken">
          <template v-if="isGeneratedRepoCard(project.image)">
            <img class="theme-light" :src="shot(project.image)" alt="" loading="lazy" decoding="async" @error="broken = true" />
            <img class="theme-dark" :src="shot(project.image, 'dark')" alt="" loading="lazy" decoding="async" @error="broken = true" />
          </template>
          <img v-else :src="shot(project.image)" alt="" loading="lazy" decoding="async" @error="broken = true" />
        </template>
      </span>
      <span class="p-title">
        <span class="p-link">{{ project.name }}</span>
        <span v-if="project.featured" class="p-pin">{{ t("featuredPinned") }}</span>
      </span>
    </span>
    <span class="p-desc">{{ project.description }}</span>
    <span class="p-lang">
      <template v-if="project.tag">
        <span class="p-dot" :style="{ background: langColor(project.tag) }" />{{ project.tag }}
      </template>
    </span>
    <span class="p-meta"><span v-for="(m, i) in project.meta" :key="i">{{ m }}</span></span>
  </SmartLink>
</template>

<style scoped>
.prow {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-1) var(--space-4);
  align-items: baseline;
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line-1);
  color: inherit;
  text-decoration: none;
}
.p-name {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.p-shot {
  position: relative;
  flex: none;
  width: 5.5rem;
  aspect-ratio: 2 / 1;
  overflow: hidden;
  border-radius: var(--r-2);
  background: var(--surf-2);
}
.p-shot img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.p-shot img.theme-light {
  display: var(--shot-light-display);
}
.p-shot img.theme-dark {
  display: var(--shot-dark-display);
}
.p-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.p-link {
  font-size: var(--fs-h3);
  font-weight: 600;
  line-height: 1.2;
  color: var(--ink-strong);
  overflow-wrap: anywhere;
}
.prow:hover .p-link,
.prow:focus-visible .p-link {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
.p-pin {
  font-size: var(--fs-meta);
  color: var(--muted);
}
/* Repo descriptions are synced, up to 350 chars: clamp so one long text cannot
   stretch its row. */
.p-desc {
  color: var(--muted);
  font-size: var(--fs-small);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.p-desc:empty,
.p-lang:empty,
.p-meta:empty {
  display: none;
}
.p-lang {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-small);
  color: var(--ink);
}
.p-dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: var(--r-round);
}
.p-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-3);
  font-family: var(--f-b);
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-meta);
  color: var(--muted);
}

@container (min-width: 720px) {
  .prow {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr) 8rem 10rem;
    column-gap: var(--space-5);
    padding: var(--space-4) 0;
    align-items: center;
  }
  .p-meta {
    justify-content: flex-end;
    text-align: right;
  }
}
</style>
