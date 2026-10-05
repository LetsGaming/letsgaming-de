<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ values: number[]; label: string; width?: number; height?: number }>(), {
  width: 120,
  height: 32,
});

const PAD = 2;
const points = computed(() => {
  const v = props.values;
  if (v.length < 2) return "";
  const max = Math.max(...v, 1);
  const w = props.width - PAD * 2;
  const h = props.height - PAD * 2;
  return v.map((n, i) => `${PAD + (i / (v.length - 1)) * w},${PAD + h - (n / max) * h}`).join(" ");
});
</script>

<template>
  <svg
    class="spark"
    role="img"
    :aria-label="label"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
  >
    <title>{{ label }}</title>
    <polyline v-if="points" :points="points" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <line v-else :x1="PAD" :x2="width - PAD" :y1="height - PAD" :y2="height - PAD" stroke="currentColor" stroke-opacity="0.4" stroke-width="2" />
  </svg>
</template>

<style scoped>
.spark {
  color: var(--purple-br);
  display: block;
  max-width: 100%;
}
</style>
