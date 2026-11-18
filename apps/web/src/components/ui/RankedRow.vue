<script setup lang="ts">
import { computed, ref, watch } from "vue";
/**
 * A ranked list row: rank · art (or a lettered monogram) · name + optional
 * subtitle · a value. The shared row of the Listening and Playtime modules, their
 * top lists and their day drill-ins all render this. Purely presentational; the
 * value is a slot so each caller formats its own ("40 min · 2×", "3h").
 */
interface Props {
  rank: number;
  name: string;
  subtitle?: string;
  /** Resolved image src (already through the media proxy). Omit → monogram. */
  art?: string;
  /** Accent the rank (used for the #1 row). */
  highlight?: boolean;
  /** Monogram shown when the name has no letters/digits to take an initial from. */
  fallback?: string;
  /** `type` leads with the name in larger type and sets art small at the end, hidden when absent. */
  variant?: "art" | "type";
}
const props = withDefaults(defineProps<Props>(), { fallback: "•", variant: "art" });

// First letter/digit of the name, for the monogram fallback. Pure, local. The
// `g` flag strips every leading symbol ("[Game]" -> "G"), not just the first.
const mono = computed(
  () => props.name.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || props.fallback,
);

// A broken image URL shows the monogram instead of a broken-image icon.
const artFailed = ref(false);
watch(
  () => props.art,
  () => {
    artFailed.value = false;
  },
);
</script>

<template>
  <div class="rr" :class="{ 'rr-1': highlight, 'rr--type': variant === 'type' }">
    <span class="rr-rank">{{ rank }}</span>
    <template v-if="variant === 'art'">
      <img v-if="art && !artFailed" class="rr-art" :src="art" alt="" loading="lazy" @error="artFailed = true" />
      <span v-else class="rr-art rr-mono">{{ mono }}</span>
    </template>
    <span class="rr-body">
      <span class="rr-name">{{ name }}</span>
      <span v-if="subtitle" class="rr-by">{{ subtitle }}</span>
    </span>
    <span class="rr-val"><slot /></span>
    <img
      v-if="variant === 'type' && art && !artFailed"
      class="rr-art rr-art--sm"
      :src="art"
      alt=""
      loading="lazy"
      @error="artFailed = true"
    />
  </div>
</template>

<style scoped>
.rr {
  display: grid;
  grid-template-columns: var(--space-5) 48px minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line-1);
}
.rr-rank {
  font-family: var(--f-b);
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  text-align: right;
}
.rr-1 .rr-rank {
  font-weight: 700;
  color: var(--ink-strong);
}
.rr-art {
  width: 48px;
  height: 48px;
  border-radius: var(--r-2);
  object-fit: cover;
  display: block;
  background: var(--surf-2);
}
.rr-mono {
  display: grid;
  place-items: center;
  font-family: var(--f-d);
  font-size: var(--fs-h3);
  color: var(--ink);
  border: 1px solid var(--line-1);
}
.rr-body {
  min-width: 0;
}
.rr-name {
  display: block;
  font-size: var(--fs-body);
  color: var(--ink-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rr-by {
  display: block;
  font-size: var(--fs-meta);
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rr-val {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  white-space: nowrap;
  text-align: right;
}
.rr-val :slotted(small) {
  color: var(--muted);
}

.rr--type {
  grid-template-columns: var(--space-5) minmax(0, 1fr) auto auto;
  padding: var(--space-2) 0;
}
.rr--type .rr-body {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--space-3);
}
.rr--type .rr-name {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h3);
  line-height: 1.2;
  white-space: normal;
  overflow-wrap: anywhere;
}
.rr--type .rr-by {
  font-size: var(--fs-small);
  white-space: normal;
}
.rr--type.rr-1 .rr-name {
  font-size: var(--fs-h2);
  line-height: 1.1;
}
.rr-art--sm {
  width: 36px;
  height: 36px;
  grid-column: 4;
}
.rr--type:not(:has(.rr-art--sm)) {
  grid-template-columns: var(--space-5) minmax(0, 1fr) auto;
}
</style>
