<script setup lang="ts">
import { computed } from "vue";
import { formatDwell, formatReach, type SectionStat } from "../../lib/sectionStats";

const props = defineProps<{
  variant: "strip" | "chips";
  status: "idle" | "loading" | "error" | "ready";
  stat: SectionStat | null;
  visits?: number;
  rangeLabel?: string;
  perPage?: boolean;
}>();
defineEmits<{ retry: [] }>();

const empty = computed(() => props.status === "ready" && (!props.stat || (props.visits ?? 0) === 0));
</script>

<template>
  <div v-if="variant === 'strip'" class="stats-strip" role="status" @click.stop>
    <template v-if="status === 'loading'">Loading stats...</template>
    <template v-else-if="status === 'error'">
      Couldn't load stats. <button class="stats-link" @click="$emit('retry')">Retry</button>
    </template>
    <template v-else-if="empty">
      No stats for this page in {{ rangeLabel?.toLowerCase() }}. The in-page script has recorded no visits yet.
    </template>
    <template v-else-if="stat">
      <span><b>{{ stat.views }}</b> views</span>
      <span><b>{{ formatDwell(stat.medianDwellSeconds) }}</b> median time</span>
      <span><b>{{ formatReach(stat.reach) }}</b> reach</span>
      <span class="stats-dim">{{ rangeLabel }} · in-page script<template v-if="perPage"> · Stats are per page</template></span>
    </template>
  </div>
  <span v-else-if="stat && status === 'ready' && !empty" class="stats-chips">
    {{ stat.views }} views · {{ formatDwell(stat.medianDwellSeconds) }} · {{ formatReach(stat.reach) }} reach
  </span>
</template>

<style scoped>
.stats-strip {
  position: sticky;
  top: var(--sp-8);
  z-index: 3;
  pointer-events: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-6) var(--sp-16);
  padding: var(--sp-8) var(--sp-12);
  background: var(--card);
  border: 1px solid var(--line-2);
  border-radius: var(--r-s);
  box-shadow: var(--sh-2);
  font-size: 13px;
  color: var(--ink);
}
.stats-dim {
  color: var(--muted);
  font-size: 12px;
}
.stats-link {
  font: inherit;
  background: none;
  border: 0;
  padding: 0;
  color: var(--purple-br);
  text-decoration: underline;
  cursor: pointer;
}
.stats-chips {
  position: absolute;
  top: var(--sp-8);
  right: var(--sp-8);
  padding: var(--sp-2) var(--sp-8);
  background: var(--card);
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--ink);
  pointer-events: none;
}
</style>
