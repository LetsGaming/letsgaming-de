<script setup lang="ts">
import { computed } from "vue";
import type { AnalyticsQuality } from "@lg/core";
import { exclusionRows, formatPercent, funnelStages, qualityNotes } from "../../lib/analytics-view";

const props = defineProps<{
  quality: AnalyticsQuality;
  /** Plain click count over the range; null when undefined. */
  clicks: number | null;
  note?: string;
  noteTitle?: string;
}>();

const stages = computed(() => funnelStages(props.quality.funnel, props.quality.measured));
const notes = computed(() => qualityNotes(props.quality));
const exclusions = computed(() => exclusionRows(props.quality.exclusions));
const rate = (r: number | null) => (r === null ? "n/a" : formatPercent(r));
</script>

<template>
  <div class="card trafficq">
    <h3>Traffic quality <span v-if="note" class="muted" :title="noteTitle">{{ note }}</span></h3>
    <div class="tq-rates">
      <div>
        <span class="slabel">Beacon coverage</span>
        <b class="sval">{{ rate(quality.coverage) }}</b>
        <span class="muted">script loads per page view</span>
      </div>
      <div>
        <span class="slabel">Confirmation rate</span>
        <b v-if="notes.unmeasured" class="sval muted">Not measured</b>
        <b v-else class="sval">{{ rate(quality.confirmationRate) }}</b>
        <span class="muted">confirmed visits per script load</span>
      </div>
      <div>
        <span class="slabel">Clicks</span>
        <b class="sval">{{ clicks === null ? "n/a" : clicks.toLocaleString("en-US") }}</b>
        <span class="muted">tracked clicks</span>
      </div>
    </div>
    <p v-if="notes.unmeasured" class="muted tq-note">Confirmation not measured in this range.</p>
    <p v-else-if="notes.partial" class="muted tq-note">
      Confirmation was only recorded for part of this range, so confirmed visits and the rate cover that part.
    </p>
    <p v-if="notes.approximateHistory" class="muted tq-note">Includes older data summarised by UTC day.</p>

    <ol class="tq-funnel" aria-label="Traffic funnel from requests to completed visits">
      <li v-for="s in stages" :key="s.id" :class="{ split: s.split, unmeasured: s.unmeasured }">
        <span class="tq-label">{{ s.label }}</span>
        <span class="tq-bar" aria-hidden="true"><i :style="{ width: `${s.width * 100}%` }" /></span>
        <b v-if="s.unmeasured" class="muted">not measured</b>
        <b v-else>{{ s.count.toLocaleString("en-US") }}</b>
      </li>
    </ol>
    <p v-if="quality.funnel.unverified > 0" class="muted tq-note">
      {{ quality.funnel.unverified.toLocaleString("en-US") }} page views had no script load: clients without
      JavaScript, blockers, Do Not Track or opt-outs.
    </p>

    <details class="tq-how">
      <summary>How a visit is confirmed</summary>
      <p class="muted">
        Every page load runs a small script. It reports a visit once, the first time the visitor
        scrolls to 25 percent, sees a section, keeps the page visible for 5 seconds, or clicks. A load
        that does none of these is counted as a script load but not as a visit. Nothing identifies the
        visitor: coverage and confirmation rate come from comparing counters, never from matching requests.
      </p>
    </details>

    <h4>Why requests were excluded</h4>
    <ul v-if="exclusions.length" class="tq-excl">
      <li v-for="e in exclusions" :key="e.id">
        <span class="tq-label" :title="e.id">{{ e.label }}</span>
        <span class="tq-bar" aria-hidden="true"><i :style="{ width: `${e.width * 100}%` }" /></span>
        <b>{{ e.count.toLocaleString("en-US") }}</b>
      </li>
    </ul>
    <p v-else class="muted">Nothing was excluded in this range.</p>
  </div>
</template>
