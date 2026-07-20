<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";

defineProps<{
  module: Extract<ResolvedModule, { kind: "hobbies" }>;
}>();
</script>

<template>
  <section :id="module.id" class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div class="hobbies">
      <p v-if="!module.data.hobbies.length" class="sub">Nothing here yet.</p>
      <div v-for="h in module.data.hobbies" :key="h.id" class="tile" :class="'t-' + h.tone">
        <div>
          <div class="ic" v-html="h.icon ? icons[h.icon] : ''" />
          <h3>{{ h.title }}</h3>
          <p>{{ h.blurb }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Hobby tiles, scoped. The svg comes from v-html (h.icon), so `.tile .ic svg`
 * becomes :deep(svg). `.sub` stays global. */
.hobbies {
  display: grid;
  gap: var(--sp-16);
  grid-template-columns: repeat(4, 1fr);
}
.tile {
  border: 1px solid var(--line-1);
  border-radius: var(--r-card);
  padding: var(--sp-20) var(--sp-18);
  box-shadow: var(--sh-card);
  transition: box-shadow 0.25s ease;
  min-height: 142px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  will-change: transform;
}
.tile:hover {
  box-shadow: var(--sh-anchor);
}
.tile .ic {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  margin-bottom: var(--sp-12);
}
.tile .ic :deep(svg) {
  width: 22px;
  height: 22px;
}
.tile h3 {
  font-family: var(--f-b);
  font-weight: 600;
  font-size: 18px;
  color: var(--ink-strong);
}
.tile p {
  font-size: 13px;
  color: var(--muted);
  margin-top: 3px;
}
.tile.t-purple {
  background: var(--tile-purple);
}
.tile.t-mint {
  background: var(--tile-mint);
}
.tile.t-coral {
  background: var(--tile-coral);
}
.tile.t-sun {
  background: var(--tile-sun);
}

/* The responsive step has to live here: once `.hobbies` moved into this scoped
   block, `.hobbies[data-v]` out-specifies a global `@media .hobbies`, so the
   breakpoint only wins from inside the same scope. Two columns on a phone, four on
   the desktop — matching the stats grid. */
@media (max-width: 680px) {
  .hobbies {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
