<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useCmsContext } from "../../../composables/cmsContext";
import { STACK_COLORS } from "../../../composables/useAnalytics";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	CLEARS,
	METRIC_LABELS,
	METRIC_UNITS,
	RANGES,
	analytics,
	analyticsAt,
	chart,
	clearRange,
	clearing,
	loadingA,
	metric,
	metricKeys,
	metricTotals,
	comparison,
	zone,
	activeZone,
	setZone,
	medianVisitLength,
	hovered,
	hoverAt,
	clearHover,
	rangeHours,
	refreshAnalytics,
	setRange,
} = useCmsContext();

/**
 * "updated 12s ago" — the panel refreshes itself now, so it has to be able to
 * say how old what you're reading is. A number that changes on its own and can't
 * tell you when it last changed is the site's own worst bug wearing a dashboard.
 *
 * A ticking `now` rather than a computed over `analyticsAt` alone: the age
 * changes with the clock, not with the data, so nothing would recompute between
 * polls and the label would sit at "0s ago" for half a minute.
 */
const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 1000);
onUnmounted(() => clearInterval(tick));

/**
 * Pointer → viewBox x.
 *
 * The SVG is `width: 100%` over a fixed 720-unit viewBox, so it renders at
 * whatever the panel is wide and client pixels are not viewBox units. Scaling by
 * the rendered width is what lets the hover resolve to the right bucket at any
 * panel size — reading `offsetX` directly would drift further off the more the
 * chart was stretched.
 */
function onPointer(e: PointerEvent) {
	const svg = e.currentTarget as SVGSVGElement;
	const rect = svg.getBoundingClientRect();
	if (!rect.width || !chart.value) return;
	hoverAt(((e.clientX - rect.left) / rect.width) * chart.value.W);
}

/** Keep the tooltip inside the plot instead of letting it run off the edge. */
const tipStyle = computed(() => {
	const c = chart.value;
	const col = hovered.value;
	if (!c || !col) return {};
	const pct = ((col.x - c.x0) / (c.x1 - c.x0)) * 100;
	return {
		left: `${((col.x / c.W) * 100).toFixed(2)}%`,
		transform: `translateX(${pct > 60 ? "-100%" : "0"}) translateX(${pct > 60 ? "-10px" : "10px"})`,
	};
});

/**
 * Series the reader has switched off by clicking the legend.
 *
 * Hiding is presentation, not data: the bands keep their stacked positions and
 * colours so toggling one back on doesn't reshuffle the chart under you.
 */
const muted = ref(new Set<string>());

/** Whether the data table is on screen as well as in the accessibility tree. */
const showTable = ref(false);
function toggleSeries(key: string) {
	const next = new Set(muted.value);
	if (!next.delete(key)) next.add(key);
	muted.value = next;
}

/** "+18%" / "−4%" / "+7" when there's no percentage to give (a rise from zero). */
function deltaText(k: string): string {
	const c = comparison.value?.[k as keyof NonNullable<typeof comparison.value>];
	if (!c || c.delta === 0) return "";
	const sign = c.delta > 0 ? "+" : "−";
	return c.pct === null
		? `${sign}${Math.abs(c.delta)}`
		: `${sign}${Math.abs(Math.round(c.pct))}%`;
}

/** Which way the arrow points — `""` when there's nothing to compare. */
function deltaDirection(k: string): "up" | "down" | "" {
	const c = comparison.value?.[k as keyof NonNullable<typeof comparison.value>];
	if (!c || c.delta === 0) return "";
	return c.delta > 0 ? "up" : "down";
}

const age = computed(() => {
	if (!analyticsAt.value) return "";
	const secs = Math.max(0, Math.round((now.value - analyticsAt.value) / 1000));
	return secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
});
</script>

<template>
  <section class="pane">
        <div v-if="!analytics" class="muted">Loading…</div>
        <template v-else>
          <div class="card chartcard">
            <div class="charthead">
              <div class="seg" role="group" aria-label="Metric">
                <button
                  v-for="k in metricKeys"
                  :key="k"
                  type="button"
                  :class="{ on: metric === k }"
                  :aria-pressed="metric === k"
                  @click="metric = k"
                >
                  <span class="slabel">{{ METRIC_LABELS[k] }}</span>
                  <span class="sval">{{ metricTotals[k] }}</span>
                  <span class="sunit">
                    {{ METRIC_UNITS[k] }}
                    <em v-if="deltaText(k)" :class="deltaDirection(k)">{{ deltaText(k) }}</em>
                  </span>
                </button>
              </div>
              <div class="seg ranges" role="group" aria-label="Clock">
                <button
                  type="button"
                  :class="{ on: zone === 'local' }"
                  :aria-pressed="zone === 'local'"
                  :title="activeZone"
                  @click="setZone('local')"
                >
                  Local
                </button>
                <button
                  type="button"
                  :class="{ on: zone === 'utc' }"
                  :aria-pressed="zone === 'utc'"
                  @click="setZone('utc')"
                >
                  UTC
                </button>
              </div>
              <div class="seg ranges" role="group" aria-label="Time range">
                <button
                  v-for="r in RANGES"
                  :key="r.hours"
                  type="button"
                  :class="{ on: rangeHours === r.hours }"
                  :aria-pressed="rangeHours === r.hours"
                  @click="setRange(r.hours)"
                >
                  {{ r.label }}
                </button>
              </div>
            </div>
            <!-- The plot is wrapped so an HTML tooltip can be positioned over it;
                 SVG can't lay out wrapping text, and a foreignObject would just be
                 the same HTML with worse support. -->
            <div class="plotwrap" @pointerleave="clearHover">
              <svg
                v-if="chart && chart.total > 0"
                class="chart"
                :viewBox="`0 0 ${chart.W} ${chart.H}`"
                aria-hidden="true"
                @pointermove="onPointer"
              >
                <!-- count gridlines -->
                <line
                  v-for="t in chart.yTicks"
                  :key="'g' + t.v"
                  class="c-grid"
                  :x1="chart.x0"
                  :x2="chart.x1"
                  :y1="t.y"
                  :y2="t.y"
                />
                <!-- stacked area layers -->
                <path
                  v-for="l in chart.layers"
                  :key="l.key"
                  :d="l.path"
                  :fill="STACK_COLORS[l.colorIndex % STACK_COLORS.length]"
                  :fill-opacity="muted.has(l.key) ? 0.06 : 0.85"
                />
                <!-- axis lines, drawn over the bands: the bottom axis sits exactly
                     on the baseline of the largest series, so without
                     pointer-events:none it swallows hovers there. -->
                <line class="c-axis" :x1="chart.x0" :y1="chart.y0" :x2="chart.x0" :y2="chart.y1" />
                <line class="c-axis" :x1="chart.x0" :y1="chart.y1" :x2="chart.x1" :y2="chart.y1" />
                <!-- crosshair at the hovered bucket -->
                <line
                  v-if="hovered"
                  class="c-cross"
                  :x1="hovered.x"
                  :x2="hovered.x"
                  :y1="chart.y0"
                  :y2="chart.y1"
                />
                <!-- y scale: counts -->
                <text v-for="t in chart.yTicks" :key="'y' + t.v" class="c-ylabel" :x="chart.x0 - 6" :y="t.y">{{ t.label }}</text>
                <!-- x scale: time -->
                <text
                  v-for="(t, i) in chart.xTicks"
                  :key="'x' + i"
                  class="c-xlabel"
                  :x="t.x"
                  :y="chart.y1 + 15"
                  :text-anchor="t.anchor"
                >{{ t.label }}</text>
              </svg>
              <!-- What actually happened at the hovered bucket. The chart used to
                   answer this with the layer's whole-range total. -->
              <div v-if="hovered && chart" class="tip" :style="tipStyle">
                <div class="tiphead">{{ hovered.label }} <b>{{ hovered.total }}</b></div>
                <div v-for="v in hovered.values" :key="v.key" class="tiprow">
                  <i :style="{ background: STACK_COLORS[v.colorIndex % STACK_COLORS.length] }" />
                  <span class="tipkey">{{ v.label }}</span>
                  <b>{{ v.count }}</b>
                </div>
                <div v-if="!hovered.values.length" class="tiprow muted">nothing recorded</div>
              </div>
            </div>
            <p v-if="chart && chart.total === 0" class="muted empty">
              No {{ METRIC_LABELS[metric].toLowerCase() }} recorded in this range yet.
            </p>
            <div v-if="chart && chart.total > 0" class="legend">
              <button
                v-for="l in chart.layers"
                :key="l.key"
                type="button"
                class="lg"
                :class="{ off: muted.has(l.key) }"
                :aria-pressed="!muted.has(l.key)"
                @click="toggleSeries(l.key)"
              >
                <i :style="{ background: STACK_COLORS[l.colorIndex % STACK_COLORS.length] }" />{{ l.label }} <b>{{ l.total }}</b>
              </button>
            </div>
            <p v-if="metric === 'visitLength' && medianVisitLength" class="muted medianline">
              Median visit length: <b>{{ medianVisitLength }}</b> — the chart bands are the
              spread of visit lengths over time.
            </p>
            <div v-if="chart" class="axistip">
              <span>
                <b>{{ METRIC_LABELS[metric] }}</b> per {{ chart.unit === "hour" ? "hour" : "day" }} (vertical) ·
                {{ zone === "utc" ? "UTC" : activeZone }} (horizontal)
                <template v-if="comparison"> · vs previous {{ rangeHours }}h</template>
                <template v-else> · no earlier data to compare</template>
              </span>
              <span v-if="loadingA" class="muted">updating…</span>
              <span v-else-if="age" class="muted">
                updated {{ age }} · refreshes itself
                <button class="link" :disabled="loadingA" @click="refreshAnalytics">refresh now</button>
              </span>
            </div>
            <!-- The chart's accessible equivalent. `role="img"` + an aria-label
                 made the whole plot one opaque image: the per-bucket values were
                 mouse-only by construction, since a screen reader ignores the
                 children of an img role. A table says the same thing in a form
                 that can be read, navigated and copied. Visually hidden by
                 default, and revealed by the toggle for anyone who just wants the
                 numbers. -->
            <div v-if="chart && chart.total > 0" class="tablewrap">
              <button type="button" class="link" :aria-expanded="showTable" @click="showTable = !showTable">
                {{ showTable ? "Hide" : "Show" }} data table
              </button>
              <div :class="showTable ? 'datatable' : 'visually-hidden'">
                <table>
                  <caption>
                    {{ METRIC_LABELS[metric] }} per {{ chart.unit }}, {{ chart.fromLabel }} to {{ chart.toLabel }}
                    ({{ zone === "utc" ? "UTC" : activeZone }}). {{ chart.total }} total.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{{ chart.unit === "hour" ? "Hour" : "Day" }}</th>
                      <th v-for="l in chart.layers" :key="l.key" scope="col">{{ l.label }}</th>
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <!-- `ci` indexes the layer's parallel `values` array; an
                         indexOf here would be a linear scan inside two nested
                         loops, over as many as 720 buckets. -->
                    <tr v-for="(col, ci) in chart.columns" :key="col.bucket">
                      <th scope="row">{{ col.label }}</th>
                      <td v-for="l in chart.layers" :key="l.key">{{ l.values[ci] }}</td>
                      <td>{{ col.total }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div class="clearbar">
              <span class="muted">Clear:</span>
              <button
                v-for="c in CLEARS"
                :key="c.id"
                class="clearbtn"
                :class="{ danger: c.hours === null }"
                :disabled="clearing"
                @click="clearRange(c.id, c.label)"
              >
                {{ c.label }}
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
            <!-- Counted, and kept out of the four cards above: those describe
                 people, and a crawler answers all four with noise. -->
            <div class="card">
              <h3>Bots <span class="muted">(not counted as visits)</span></h3>
              <ul>
                <li v-for="r in analytics.bots" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li>
              </ul>
              <p v-if="!analytics.bots?.length" class="muted">Nothing self-identified as a bot in this range.</p>
            </div>
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
