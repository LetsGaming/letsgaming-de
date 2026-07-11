<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	CLEARS,
	METRIC_LABELS,
	RANGES,
	analytics,
	chart,
	clearRange,
	clearing,
	loadingA,
	metric,
	metricKeys,
	metricTotals,
	rangeHours,
	setRange,
	tab,
} = useCmsContext();
</script>

<template>
  <section class="pane">
        <div v-if="!analytics" class="muted">Loading…</div>
        <template v-else>
          <div class="card chartcard">
            <div class="charthead">
              <div class="seg">
                <button
                  v-for="k in metricKeys"
                  :key="k"
                  :class="{ on: metric === k }"
                  @click="metric = k"
                >
                  <span class="slabel">{{ METRIC_LABELS[k] }}</span>
                  <span class="sval">{{ metricTotals[k] }}</span>
                </button>
              </div>
              <div class="seg ranges">
                <button
                  v-for="[label, h] in RANGES"
                  :key="h"
                  :class="{ on: rangeHours === h }"
                  @click="setRange(h)"
                >
                  {{ label }}
                </button>
              </div>
            </div>
            <svg v-if="chart" class="chart" :viewBox="`0 0 ${chart.W} ${chart.H}`">
              <path v-for="l in chart.layers" :key="l.key" :d="l.path" :fill="l.color" fill-opacity="0.85">
                <title>{{ l.key }}: {{ l.total }}</title>
              </path>
            </svg>
            <p v-if="chart && chart.total === 0" class="muted empty">
              No {{ METRIC_LABELS[metric].toLowerCase() }} recorded in this range yet.
            </p>
            <div v-if="chart && chart.total > 0" class="legend">
              <span v-for="l in chart.layers" :key="l.key" class="lg">
                <i :style="{ background: l.color }" />{{ l.key }} <b>{{ l.total }}</b>
              </span>
            </div>
            <div class="xaxis">
              <span>{{ chart?.fromLabel }}</span>
              <span class="muted">{{ chart?.unit === "hour" ? "hourly" : "daily" }}{{ loadingA ? " · updating…" : "" }}</span>
              <span>{{ chart?.toLabel }}</span>
            </div>
            <div class="clearbar">
              <span class="muted">Clear:</span>
              <button
                v-for="[label, range] in CLEARS"
                :key="range"
                class="clearbtn"
                :class="{ danger: range === 'all' }"
                :disabled="clearing"
                @click="clearRange(range, label)"
              >
                {{ label }}
              </button>
            </div>
          </div>
          <p v-if="analytics && !analytics.paths.length" class="muted" style="margin-top: 4px">
            No traffic stats yet. These come from the reverse-proxy access log — set
            <b>ACCESS_LOG</b> on the server (see <code>.env.example</code>). The cookieless
            engagement stats below don't need it.
          </p>
          <div class="cols">
            <div class="card"><h3>Top paths</h3><ul><li v-for="r in analytics.paths" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
            <div class="card"><h3>Referrers</h3><ul><li v-for="r in analytics.referrers" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
            <div class="card"><h3>Browsers</h3><ul><li v-for="r in analytics.browsers" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
            <div class="card"><h3>OS</h3><ul><li v-for="r in analytics.os" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
            <div class="card"><h3>Devices</h3><ul><li v-for="r in analytics.devices" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
          </div>
          <template v-if="analytics.engagement">
            <h3 style="margin-top: 8px">Engagement <span class="muted">— cookieless, in-page</span></h3>
            <div class="cols">
              <div class="card"><h3>Sections viewed</h3><ul><li v-for="r in analytics.engagement.tabs" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Transitions</h3><ul><li v-for="r in analytics.engagement.transitions" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Exited from</h3><ul><li v-for="r in analytics.engagement.exits" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Dwell / section</h3><ul><li v-for="r in analytics.engagement.dwell" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Scroll depth</h3><ul><li v-for="r in analytics.engagement.scroll" :key="r.key"><span>{{ r.key }}%</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Clicks</h3><ul><li v-for="r in analytics.engagement.clicks" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Projects opened</h3><ul><li v-for="r in analytics.engagement.projects" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Viewport</h3><ul><li v-for="r in analytics.engagement.viewport" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Sections / visit</h3><ul><li v-for="r in analytics.engagement.sessionTabs" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Visit length</h3><ul><li v-for="r in analytics.engagement.sessionDwell" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Theme</h3><ul><li v-for="r in analytics.engagement.theme" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
            </div>
          </template>
          <p class="muted">Anonymous aggregates only — no cookies, no IPs, nothing personal stored.</p>
        </template>
      </section>
</template>
