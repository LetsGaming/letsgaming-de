<script setup lang="ts">
import { computed } from "vue";
/**
 * A ranked list row: rank · art (or a lettered monogram) · name + optional
 * subtitle · a value. The shared row of the Listening and Playtime modules — their
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
}
const props = withDefaults(defineProps<Props>(), { fallback: "•" });

// First letter/digit of the name, for the monogram fallback. Pure, local.
const mono = computed(
  () => props.name.replace(/[^\p{L}\p{N}]/u, "").charAt(0).toUpperCase() || props.fallback,
);
</script>

<template>
  <div class="rr" :class="{ 'rr-1': highlight }">
    <span class="rr-rank">{{ rank }}</span>
    <img v-if="art" class="rr-art" :src="art" alt="" loading="lazy" />
    <span v-else class="rr-art rr-mono">{{ mono }}</span>
    <span class="rr-body">
      <span class="rr-name">{{ name }}</span>
      <span v-if="subtitle" class="rr-by">{{ subtitle }}</span>
    </span>
    <span class="rr-val"><slot /></span>
  </div>
</template>

<style scoped>
.rr {
  display: grid;
  grid-template-columns: 18px 34px 1fr auto;
  gap: var(--sp-10);
  align-items: center;
  padding: var(--sp-6) 0;
  border-top: 1px solid var(--line-1);
}
.rr:first-child {
  border-top: none;
}
.rr-rank {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  text-align: right;
}
.rr-1 .rr-rank {
  color: var(--live-ink);
}
.rr-art {
  width: 34px;
  height: 34px;
  border-radius: var(--r-chip);
  object-fit: cover;
  display: block;
  background: var(--surf-3);
}
.rr-mono {
  display: grid;
  place-items: center;
  font-family: var(--f-d);
  font-size: var(--fs-body);
  color: var(--live-ink);
  background: linear-gradient(135deg, var(--surf-3), var(--surf-1));
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
  color: var(--ink);
  white-space: nowrap;
  text-align: right;
}
.rr-val :slotted(small) {
  color: var(--muted);
}
</style>
