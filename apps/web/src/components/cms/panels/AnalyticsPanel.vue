<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useCmsContext } from "../../../composables/cmsContext";
import { STACK_COLORS } from "../../../composables/useAnalytics";
import AnalyticsCard from "../AnalyticsCard.vue";

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
	at,
	atLabel,
	setAt,
	selectAt,
	filterDim,
	filterKey,
	selectDimension,
	clearDimensionFilter,
	filteredComparison,
	chips,
	clearFilters,
	referrerRules,
	savingRules,
	addReferrerRule,
	removeReferrerRule,
	saveReferrerRules,
	hovered,
	hoverAt,
	clearHover,
	rangeHours,
	customRange,
	setCustomRange,
	clearCustomRange,
	refreshAnalytics,
	setRange,
	pollFailing,
} = useCmsContext();

/** Custom from/to picker: a disclosure like the referrer-rule editor, open or
 *  closed independent of whether a custom range is actually active — closing
 *  it doesn't clear a range already applied. */
const showCustomRange = ref(false);
const todayStr = new Date().toISOString().slice(0, 10);
const customFromInput = ref(customRange.value?.from ?? "");
const customToInput = ref(customRange.value?.to ?? "");

function applyCustomRange() {
	setCustomRange(customFromInput.value, customToInput.value);
	showCustomRange.value = false;
}
function clearCustomRangeAndClose() {
	clearCustomRange();
	customFromInput.value = "";
	customToInput.value = "";
	showCustomRange.value = false;
}

/** "vs previous 72h" for a preset, "vs previous 6 days" for a custom span —
 *  the axis caption's comparison line needs a window length either way. */
const comparisonLabel = computed(() => {
	if (customRange.value) {
		const days =
			Math.round((Date.parse(customRange.value.to) - Date.parse(customRange.value.from)) / 86_400_000) + 1;
		return `${days} day${days === 1 ? "" : "s"}`;
	}
	return `${rangeHours.value}h`;
});

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

/** A click anywhere on the plot drills the lists below into that bucket. */
function onSelect(e: PointerEvent) {
	const svg = e.currentTarget as SVGSVGElement;
	const rect = svg.getBoundingClientRect();
	if (!rect.width || !chart.value) return;
	selectAt(((e.clientX - rect.left) / rect.width) * chart.value.W);
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

/** Scroll depth is stored as a bare number; the card shows it as a percentage. */
const scrollRows = computed(() =>
	(analytics.value?.engagement?.scroll ?? []).map((r) => ({ key: `${r.key}%`, count: r.count })),
);

/** Where to draw the held marker for the selected bucket. */
const atColumn = computed(() =>
	at.value ? (chart.value?.columns.find((c) => c.bucket === at.value) ?? null) : null,
);

/** Why a card that isn't the active dimension filter still shows the whole
 *  range — `analytics_hourly` keeps no link between one dimension's rows and
 *  another's (ADR-0007), so a filter can only ever narrow its own card. Short
 *  enough to sit in the heading; the full reason is a hover tooltip. */
const CROSS_FILTER_NOTE = "(not filtered)";
const CROSS_FILTER_TITLE =
	"Counters are stored one per dimension with nothing linking them, so this list can't be narrowed by a filter on a different dimension.";

/** Whether the referrer-rule editor is open. */
const showRules = ref(false);
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

/** Same shape as `deltaText`/`deltaDirection`, for the single filtered-dimension
 *  tile rather than one of the six per-metric ones. */
const filteredDeltaText = computed(() => {
	const c = filteredComparison.value;
	if (!c || c.delta === 0) return "";
	const sign = c.delta > 0 ? "+" : "−";
	return c.pct === null ? `${sign}${Math.abs(c.delta)}` : `${sign}${Math.abs(Math.round(c.pct))}%`;
});
const filteredDeltaDirection = computed<"up" | "down" | "">(() => {
	const c = filteredComparison.value;
	if (!c || c.delta === 0) return "";
	return c.delta > 0 ? "up" : "down";
});

const age = computed(() => {
	if (!analyticsAt.value) return "";
	const secs = Math.max(0, Math.round((now.value - analyticsAt.value) / 1000));
	return secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
});

/** Same "Ns ago"/"Nm ago"/"Nh ago" shape as `age`, but for an arbitrary ISO
 *  timestamp (the ingest watermark) rather than the fixed `analyticsAt`. */
function relativeAge(iso: string): string {
	const secs = Math.max(0, Math.round((now.value - Date.parse(iso)) / 1000));
	if (secs < 60) return `${secs}s ago`;
	if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
	return `${Math.round(secs / 3600)}h ago`;
}

/** Server-side access-log ingest health, distinct from `pollFailing` (which is
 *  about this browser reaching the CMS API at all). Only rendered when the
 *  server reports `ingest` at all, i.e. ACCESS_LOG is configured. */
const ingestStatus = computed(() => {
	const ingest = analytics.value?.ingest;
	if (!ingest) return null;
	if (ingest.lastError) {
		return {
			failed: true,
			text: ingest.lastSuccessAt
				? `Sync failing since ${relativeAge(ingest.lastSuccessAt)}: ${ingest.lastError}`
				: `Sync failing: ${ingest.lastError}`,
		};
	}
	if (ingest.lastSuccessAt) {
		return { failed: false, text: `Last successful ingest: ${relativeAge(ingest.lastSuccessAt)}` };
	}
	return null;
});
</script>

<template>
  <section class="pane">
        <div v-if="!analytics" class="muted">Loading…</div>
        <template v-else>
          <div class="card chartcard">
            <p v-if="filterDim && filterKey" class="muted filternote">
              <b>Filtered to {{ filterDim }} = {{ filterKey }}.</b>
              Counters are stored one per dimension with nothing linking them, so
              page views, clicks and visit length can't be broken down by it. The
              chart and total below show {{ filterDim }} = {{ filterKey }} over time.
            </p>
            <div class="charthead">
              <div class="seg" role="group" aria-label="Metric" :aria-disabled="!!(filterDim && filterKey)">
                <template v-if="filterDim && filterKey">
                  <button type="button" class="on" aria-pressed="true">
                    <span class="slabel">{{ filterDim }}: {{ filterKey }}</span>
                    <span class="sval">{{ analytics?.filtered?.total ?? 0 }}</span>
                    <span class="sunit">
                      filtered
                      <em v-if="filteredDeltaText" :class="filteredDeltaDirection">{{ filteredDeltaText }}</em>
                    </span>
                  </button>
                </template>
                <template v-else>
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
                </template>
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
                  :class="{ on: !customRange && rangeHours === r.hours }"
                  :aria-pressed="!customRange && rangeHours === r.hours"
                  @click="setRange(r.hours)"
                >
                  {{ r.label }}
                </button>
                <button
                  type="button"
                  :class="{ on: !!customRange }"
                  :aria-pressed="!!customRange"
                  :aria-expanded="showCustomRange"
                  @click="showCustomRange = !showCustomRange"
                >
                  {{ customRange ? `${customRange.from} – ${customRange.to}` : "Custom" }}
                </button>
              </div>
            </div>
            <div v-if="showCustomRange" class="customrange">
              <label>
                From
                <input v-model="customFromInput" type="date" :max="todayStr" />
              </label>
              <label>
                To
                <input v-model="customToInput" type="date" :max="todayStr" />
              </label>
              <button type="button" class="btn" @click="applyCustomRange">Apply</button>
              <button v-if="customRange" type="button" class="btn ghost" @click="clearCustomRangeAndClose">
                Back to presets
              </button>
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
                @click="onSelect"
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
                <!-- the selected bucket, held until it's cleared -->
                <line
                  v-if="atColumn"
                  class="c-focus"
                  :x1="atColumn.x"
                  :x2="atColumn.x"
                  :y1="chart.y0"
                  :y2="chart.y1"
                />
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
            <p v-if="chart && chart.total === 0 && filterDim && filterKey" class="muted empty">
              No data for {{ filterKey }} in this range — the source name may have changed since.
            </p>
            <p v-else-if="chart && chart.total === 0" class="muted empty">
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
                <b v-if="filterDim && filterKey">{{ filterDim }}: {{ filterKey }}</b>
                <b v-else>{{ METRIC_LABELS[metric] }}</b>
                per {{ chart.unit === "hour" ? "hour" : "day" }} (vertical) ·
                {{ zone === "utc" ? "UTC" : activeZone }} (horizontal)
                <template v-if="filterDim && filterKey">
                  <template v-if="filteredComparison"> · vs previous {{ comparisonLabel }}</template>
                  <template v-else> · no earlier data to compare</template>
                </template>
                <template v-else-if="comparison"> · vs previous {{ comparisonLabel }}</template>
                <template v-else> · no earlier data to compare</template>
              </span>
              <span v-if="pollFailing" class="syncstatus failed">
                Couldn't reach the server — retrying
                <button class="link" :disabled="loadingA" @click="refreshAnalytics">retry now</button>
              </span>
              <span v-else-if="loadingA" class="muted">updating…</span>
              <span v-else-if="age" class="muted">
                updated {{ age }} · refreshes itself
                <button class="link" :disabled="loadingA" @click="refreshAnalytics">refresh now</button>
              </span>
            </div>
            <div v-if="ingestStatus" class="syncstatus" :class="{ failed: ingestStatus.failed }">
              {{ ingestStatus.text }}
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
          <p v-if="analytics && !analytics?.paths?.length" class="muted" style="margin-top: 4px">
            No traffic stats yet. These come from the reverse-proxy access log — set
            <b>ACCESS_LOG</b> on the server (see <code>.env.example</code>). The cookieless
            engagement stats below don't need it.
          </p>
          <!-- What's currently narrowing the view, and one way back for all of
               it. Always rendered, so the default state is a visible choice
               rather than an absence — you can't clear a filter you didn't
               know was on. -->
          <div class="filterbar" role="group" aria-label="Active filters">
            <span v-if="!chips.length" class="muted">Showing the whole range</span>
            <button v-for="c in chips" :key="c.id" type="button" class="chip" @click="c.clear()">
              {{ c.label }} <span aria-hidden="true">✕</span>
              <span class="visually-hidden">— remove filter</span>
            </button>
            <button v-if="chips.length > 1" type="button" class="link" @click="clearFilters">Clear all</button>
          </div>
          <div class="cols">
            <AnalyticsCard
              title="Top paths"
              :rows="analytics?.paths"
              dimension="path"
              :selected-key="filterDim === 'path' ? filterKey : null"
              :note="filterDim && filterDim !== 'path' ? CROSS_FILTER_NOTE : undefined"
              :note-title="filterDim && filterDim !== 'path' ? CROSS_FILTER_TITLE : undefined"
              @select="(k) => selectDimension('path', k)"
            />
            <AnalyticsCard
              title="Referrers"
              :rows="analytics?.referrers"
              dimension="referrer"
              :selected-key="filterDim === 'referrer' ? filterKey : null"
              :note="filterDim && filterDim !== 'referrer' ? CROSS_FILTER_NOTE : undefined"
              :note-title="filterDim && filterDim !== 'referrer' ? CROSS_FILTER_TITLE : undefined"
              @select="(k) => selectDimension('referrer', k)"
            >
              <!-- Editing lives here rather than in a content panel because this
                   is where you find out you need a rule: an unfamiliar host in
                   the list above is the prompt to name it. -->
              <button type="button" class="link" :aria-expanded="showRules" @click="showRules = !showRules">
                {{ showRules ? "Hide" : "Name a source" }}
              </button>
              <div v-if="showRules" class="rules">
                <p class="muted">
                  Map a host to a name — <code>steamcommunity.com</code> → <code>Steam</code>.
                  Subdomains are included. Applies to past traffic too.
                </p>
                <div v-for="(r, i) in referrerRules" :key="i" class="rule">
                  <input v-model="r.match" placeholder="host, e.g. chatgpt.com" aria-label="Referrer host" />
                  <input v-model="r.label" placeholder="name, e.g. ChatGPT" aria-label="Source name" />
                  <button type="button" class="link" @click="removeReferrerRule(i)" aria-label="Remove rule">✕</button>
                </div>
                <div class="ruleactions">
                  <button type="button" class="btn ghost" @click="addReferrerRule()">+ Add rule</button>
                  <button type="button" class="btn" :disabled="savingRules" @click="saveReferrerRules()">
                    {{ savingRules ? "Saving…" : "Save rules" }}
                  </button>
                </div>
              </div>
            </AnalyticsCard>
            <AnalyticsCard
              title="Browsers"
              :rows="analytics?.browsers"
              dimension="browser"
              :selected-key="filterDim === 'browser' ? filterKey : null"
              :note="filterDim && filterDim !== 'browser' ? CROSS_FILTER_NOTE : undefined"
              :note-title="filterDim && filterDim !== 'browser' ? CROSS_FILTER_TITLE : undefined"
              @select="(k) => selectDimension('browser', k)"
            />
            <AnalyticsCard
              title="OS"
              :rows="analytics?.os"
              dimension="os"
              :selected-key="filterDim === 'os' ? filterKey : null"
              :note="filterDim && filterDim !== 'os' ? CROSS_FILTER_NOTE : undefined"
              :note-title="filterDim && filterDim !== 'os' ? CROSS_FILTER_TITLE : undefined"
              @select="(k) => selectDimension('os', k)"
            />
            <AnalyticsCard
              title="Devices"
              :rows="analytics?.devices"
              dimension="device"
              :selected-key="filterDim === 'device' ? filterKey : null"
              :note="filterDim && filterDim !== 'device' ? CROSS_FILTER_NOTE : undefined"
              :note-title="filterDim && filterDim !== 'device' ? CROSS_FILTER_TITLE : undefined"
              @select="(k) => selectDimension('device', k)"
            />
            <!-- Counted, and kept out of the four cards above: those describe
                 people, and a crawler answers all four with noise. -->
            <AnalyticsCard
              title="Bots"
              note="(not counted as visits)"
              :rows="analytics?.bots"
              empty="Nothing self-identified as a bot in this range."
              dimension="bot"
              :selected-key="filterDim === 'bot' ? filterKey : null"
              @select="(k) => selectDimension('bot', k)"
            />
            <!-- The traffic the bot check can't see: scanners send a real browser
                 user-agent, so they're identified by what they asked for. Kept
                 out of the cards above for the same reason bots are. -->
            <AnalyticsCard
              title="Probes"
              note="(scans, not people)"
              :rows="analytics?.probes"
              empty="No scanner traffic in this range."
              dimension="probe"
              :selected-key="filterDim === 'probe' ? filterKey : null"
              @select="(k) => selectDimension('probe', k)"
            />
          </div>
          <template v-if="analytics?.engagement">
            <h3 style="margin-top: 8px">Engagement <span class="muted">— cookieless, in-page</span></h3>
            <div class="cols">
              <AnalyticsCard title="Sections viewed" :rows="analytics.engagement.tabs" />
              <AnalyticsCard title="Transitions" :rows="analytics.engagement.transitions" />
              <AnalyticsCard title="Exited from" :rows="analytics.engagement.exits" />
              <AnalyticsCard title="Dwell / section" :rows="analytics.engagement.dwell" />
              <AnalyticsCard title="Scroll depth" :rows="scrollRows" />
              <AnalyticsCard title="Clicks" :rows="analytics.engagement.clicks" />
              <AnalyticsCard title="Projects opened" :rows="analytics.engagement.projects" />
              <AnalyticsCard title="Viewport" :rows="analytics.engagement.viewport" />
              <AnalyticsCard title="Sections / visit" :rows="analytics.engagement.sessionTabs" />
              <AnalyticsCard title="Visit length" :rows="analytics.engagement.sessionDwell" />
              <AnalyticsCard title="Theme" :rows="analytics.engagement.theme" />
            </div>
          </template>
          <p class="muted">Anonymous aggregates only — no cookies, no IPs, nothing personal stored.</p>
        </template>
      </section>
</template>
