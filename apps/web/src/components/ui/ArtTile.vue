<script setup lang="ts">
import { computed, ref, watch } from "vue";

interface Props {
  rank: number;
  name: string;
  subtitle?: string;
  art?: string;
  ratio?: "square" | "wide";
  highlight?: boolean;
}
const props = withDefaults(defineProps<Props>(), { ratio: "wide" });

const mono = computed(() => props.name.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || "•");

const artFailed = ref(false);
watch(
  () => props.art,
  () => {
    artFailed.value = false;
  },
);
</script>

<template>
  <li class="at" :class="[`at--${ratio}`, { 'at-1': highlight }]">
    <span class="at-frame">
      <img v-if="art && !artFailed" class="at-art" :src="art" alt="" loading="lazy" @error="artFailed = true" />
      <span v-else class="at-art at-mono">{{ mono }}</span>
      <span class="at-rank">{{ rank }}</span>
    </span>
    <span class="at-name">{{ name }}</span>
    <span v-if="subtitle" class="at-by">{{ subtitle }}</span>
    <span class="at-val"><slot /></span>
  </li>
</template>

<style scoped>
.at {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  list-style: none;
}
.at-frame {
  position: relative;
  display: block;
}
.at-art {
  display: block;
  width: 100%;
  object-fit: cover;
  border-radius: var(--r-2);
  background: var(--surf-2);
}
.at--wide .at-art {
  aspect-ratio: 16 / 10;
}
.at--square .at-art {
  aspect-ratio: 1;
}
.at-mono {
  display: grid;
  place-items: center;
  font-family: var(--f-d);
  font-size: var(--fs-h2);
  color: var(--ink);
  border: 1px solid var(--line-1);
}
.at-rank {
  position: absolute;
  left: var(--space-2);
  top: var(--space-2);
  min-width: var(--space-5);
  padding: 0 var(--space-1);
  border-radius: var(--r-1);
  background: var(--surf-0);
  color: var(--ink);
  font-size: var(--fs-meta);
  line-height: var(--space-5);
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.at-1 .at-rank {
  font-weight: 700;
  color: var(--ink-strong);
}
.at-name {
  margin-top: var(--space-1);
  font-size: var(--fs-small);
  font-weight: 600;
  line-height: 1.25;
  color: var(--ink-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.at-by {
  font-size: var(--fs-meta);
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.at-val {
  font-size: var(--fs-meta);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.at-val :slotted(small) {
  color: var(--muted);
}
</style>
