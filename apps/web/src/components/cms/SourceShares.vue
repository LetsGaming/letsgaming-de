<script setup lang="ts">
import type { AnalyticsSources } from "@lg/core";
import { sourceLabel } from "../../lib/analytics-view";

defineProps<{ sources: AnalyticsSources; note?: string; noteTitle?: string }>();

const width = (share: number | null) => `${Math.round((share ?? 0) * 100)}%`;
const text = (share: number | null) => (share === null ? "n/a" : width(share));
</script>

<template>
  <div class="card">
    <h3>Sources <span v-if="note" class="muted" :title="noteTitle">{{ note }}</span></h3>
    <ul v-if="sources.rows.length" class="funnels">
      <li v-for="r in sources.rows" :key="r.key">
        <div class="funnelhead">
          <span class="rowkey">{{ sourceLabel(r.key) }}</span>
          <span class="muted">{{ r.count.toLocaleString("en-US") }}</span>
        </div>
        <div class="funnelrow">
          <span class="bar" aria-hidden="true"><i :style="{ width: width(r.share) }" /></span>
          <b>{{ text(r.share) }}</b>
        </div>
      </li>
    </ul>
    <p v-else class="muted">No classified page views in this range.</p>
  </div>
</template>
