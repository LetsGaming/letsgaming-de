<script setup lang="ts">
/**
 * The site's table of contents, as cards.
 *
 * Home's job is an overview and a way in, and it was previewing one area: the
 * stats and the featured repo are both GitHub. This is the section that says the
 * rest of the site is there.
 *
 * Deliberately links rather than embeds. A preview that renders the real Life
 * modules would duplicate them — one source of truth per module is the whole point
 * of the nav model — and a visitor who has already seen the content has no reason
 * to click. A label, the area's own sentence, and a count is enough to make the
 * click worth making.
 *
 * Real `<a href>`s, not click handlers: middle-clickable, crawlable, and they work
 * before hydration. Same reasoning as `targetHref` in the nav model.
 */
import { useT } from "~/composables/useT";
import type { ResolvedModule } from "@lg/core";
import ModuleSection from "../ui/ModuleSection.vue";
import { icons } from "../../lib/icons";

const { t } = useT();

const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "areas" }>;
}>();

/** Singular gets its own key — "1 sections" is the tell that nobody read the copy. */
const countLabel = (n: number) => (n === 1 ? t("areaModulesOne") : t("areaModules", { n }));

/** Three or fewer sit in one row; more wrap at two, so a row is never one wide. */
const columns = () => Math.min(props.module.data.areas.length, 3);
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading" :note="module.data.note">
    <nav class="areas" :style="{ '--cols': columns() }" :aria-label="module.data.heading">
      <a v-for="a in module.data.areas" :key="a.id" class="area" :href="a.href">
        <span v-if="a.icon" class="area__ic" v-html="icons[a.icon] ?? ''" />
        <span class="area__label">{{ a.label }}</span>
        <span v-if="a.description" class="area__desc">{{ a.description }}</span>
        <span class="area__meta">
          {{ countLabel(a.moduleCount) }}
          <span class="area__arrow" aria-hidden="true">→</span>
        </span>
      </a>
    </nav>
  </ModuleSection>
</template>

<style scoped>
/* Ruled columns rather than boxes — the same call as the lead StatTiles. Three
   cards in a row is where "everything is a card" starts, and these are peers, so
   alignment plus a hairline says it without adding three more containers. */
.areas {
  display: grid;
  grid-template-columns: repeat(var(--cols, 3), 1fr);
  gap: 0;
  border-top: 1px solid var(--line-1);
}
.area {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
  padding: var(--sp-20) var(--sp-20) var(--sp-18);
  border-inline-start: 1px solid var(--line-1);
  border-bottom: 1px solid var(--line-1);
  color: inherit;
  text-decoration: none;
  transition: background var(--dur-fast) var(--ease-out);
}
.area:first-child {
  border-inline-start: 0;
  padding-inline-start: 0;
}
/* The whole card is the target, so the hover has to read as one surface. */
.area:hover,
.area:focus-visible {
  background: var(--surf-1);
}
.area__ic {
  width: 22px;
  height: 22px;
  color: var(--live-ink);
  margin-bottom: var(--sp-2);
}
.area__ic :deep(svg) {
  width: 22px;
  height: 22px;
}
.area__label {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: 20px;
  color: var(--ink-strong);
}
.area__desc {
  font-size: var(--fs-body);
  color: var(--muted);
  /* The area's meta sentence, which has no length contract — it was written for a
     search result. Two lines, then it's the click's job. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.area__meta {
  display: flex;
  align-items: center;
  gap: var(--sp-8);
  margin-top: auto;
  padding-top: var(--sp-12);
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
.area__arrow {
  margin-left: auto;
  transition: transform var(--dur-fast) var(--ease-out);
}
.area:hover .area__arrow,
.area:focus-visible .area__arrow {
  transform: translateX(3px);
  color: var(--live-ink);
}

/* Two up on a phone, and the first-child exception no longer matches the row
   start, so it's recomputed for the new column count. */
@media (max-width: 680px) {
  .areas {
    grid-template-columns: repeat(2, 1fr);
  }
  .area:nth-child(2n + 1) {
    border-inline-start: 0;
    padding-inline-start: 0;
  }
  .area:nth-child(2n) {
    padding-inline-end: 0;
  }
}
</style>
