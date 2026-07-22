<script setup lang="ts">
/**
 * A project, as a card: title + arrow, a language tag coloured by that language,
 * a description, and a row of meta facts. The whole thing is the link.
 *
 * Projects and Featured rendered this identically — same markup, same
 * `langColor()` inline style, same pair of tracking calls — differing only in
 * whether the card spans the grid. That difference is the `feature` prop now.
 *
 * It takes the resolved `ProjectView` whole rather than seven scattered props, so
 * a field added to the contract lands here without touching either caller.
 */
import { computed } from "vue";
import type { ClickAction, ProjectView } from "@lg/core";
import { langColor, icons } from "../../lib/icons";
import { trackClick, trackProject } from "../../lib/track";
import SmartLink from "./SmartLink.vue";

interface Props {
  project: ProjectView;
  /**
   * Force the pinned treatment. The Featured module pins whatever it was given —
   * it falls back to the first project when none is marked — so it can't rely on
   * `project.featured`. Elsewhere the project's own flag decides.
   */
  feature?: boolean;
  /** Analytics label for the click ("project" / "featured"). */
  event: ClickAction;
}
const props = defineProps<Props>();

const pinned = computed(() => props.feature ?? props.project.featured);

// One derivation for both the text and the border, rather than calling langColor
// twice in the template on every render.
const tagStyle = computed(() => {
  const colour = langColor(props.project.tag);
  return { color: colour, borderColor: colour };
});

function onClick() {
  trackClick(props.event);
  trackProject(props.project.name);
}
</script>

<template>
  <SmartLink class="card" :class="{ feature: pinned }" :href="project.href" @click="onClick">
    <div class="ptitle">{{ project.name }}<span class="arrow" v-html="icons.arrow" /></div>
    <span class="tag" :style="tagStyle">{{ project.tag }}</span>
    <p class="desc">{{ project.description }}</p>
    <div class="meta"><span v-for="(m, i) in project.meta" :key="i">{{ m }}</span></div>
  </SmartLink>
</template>

<style scoped>
/* Moved out of app.css with the markup: `.ptitle`, `.desc`, `.arrow` and the
   `.feature` overrides styled these two sections and nothing else, so they belong
   with the component rather than in the global sheet. `.card`, `.tag` and `.meta`
   stay global — the CMS panels and the posts list share those. */
.ptitle {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: clamp(19px, 3vw, 25px);
  letter-spacing: -0.01em;
  margin-bottom: 9px;
  display: flex;
  align-items: center;
  gap: var(--sp-10);
  color: var(--ink-strong);
}
.desc {
  color: var(--muted);
  font-size: var(--fs-body);
  margin: 11px 0 var(--sp-16);
  max-width: 48ch;
}
.arrow {
  margin-left: auto;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--surf-2);
  display: grid;
  place-items: center;
  transition:
    transform 0.2s ease,
    background 0.2s ease;
}
.card:hover .arrow {
  transform: translateX(3px) rotate(-45deg);
  background: var(--surf-3);
}
/* The glyph arrives via v-html, so it is not compiled with this component's
   scope attribute and needs :deep() to be reachable. */
.arrow :deep(svg) {
  width: 16px;
  height: 16px;
  color: var(--ink);
}

/* The pinned card. */
.card.feature {
  grid-column: 1 / -1;
  padding: 32px;
  background: var(--surf-2);
  border: 1px solid var(--line-2);
}
.card.feature .ptitle {
  font-size: clamp(24px, 4.5vw, 34px);
}
.card.feature .desc {
  color: var(--ink);
  font-size: 17px;
  max-width: 54ch;
}
.card.feature .meta {
  color: var(--muted);
}
.card.feature .tag {
  background: var(--surf-1);
}
.card.feature .arrow {
  background: rgba(255, 255, 255, 0.2);
}

/* The grid stays two-up on phones (see app.css); the pinned card spans it either
   way, so all it needs here is the tighter padding. */
@media (max-width: 560px) {
  .card.feature {
    padding: var(--sp-20);
  }
}
</style>
