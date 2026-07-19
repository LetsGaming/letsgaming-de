<script setup lang="ts">
/**
 * The historical playtime module (features 02 + 03).
 *
 * Two views of the past, which is why this is its own module and not more of
 * `presence`: that card is "Right now" — the live dot, the fortnight. This is
 * accumulated history, drawn from data the present-tense card deliberately never
 * reads. Same split the sampler-vs-source distinction drew in the backend.
 *
 * - **The ledger** — exact minutes per day, differenced server-side from Steam's
 *   lifetime counters. Clicking a column fetches that day's breakdown and pins it
 *   against the all-time figures, so a day is always read against the whole.
 * - **The heatmap** — weekday×hour, the same `.heat` component as the contribution
 *   graph, so "when do I play" reads the way "did he commit today" does.
 */
import { computed } from "vue";
import type { PlaytimeDayResponse, ResolvedModule } from "@lg/core";
import { presenceMediaUrl } from "../../lib/api";
import { useDayDrill } from "../../composables/useDayDrill";
import { useLiveModule } from "../../composables/useLiveModule";
import { fetchPlaytimeDay } from "../../lib/playtime-api";
import { contiguousDays } from "../../lib/calendar";
import HeatGrid, { type HeatCell } from "../ui/HeatGrid.vue";

const props = defineProps<{ module: Extract<ResolvedModule, { kind: "playtime" }> }>();
// Polls `/api/module/:id` so playtime refreshes in place (like presence), starting
// from the SSR-rendered data.
const { data: liveData } = useLiveModule(props.module.id, "playtime", props.module.data);
const d = computed(() => liveData.value);

// ── recently played ──────────────────────────────────────────────────────────
// The shelf that used to sit in the presence card. Each row is a game with its
// fortnight hours; `source` says whether the number is Steam's (a true total) or
// observed from Discord (a floor — Discord only sees what it's running for). The
// icon is proxied like everywhere else; a lettered tile stands in when there's no
// icon, which is every non-Steam game (Discord hands over a name and nothing more).
const recent = computed(() => d.value.recent ?? []);
const gameIcon = (url?: string) => (url ? presenceMediaUrl({ url }) : undefined);
const gameAccent = (accent?: string) => accent ?? "var(--surf-3)";
const storeUrl = (appId?: number) =>
  appId != null ? `https://store.steampowered.com/app/${appId}` : undefined;
const fmtGameHrs = (min: number) => {
  const h = min / 60;
  return (h >= 10 || h % 1 === 0 ? Math.round(h) : h.toFixed(1)) + "h";
};

// ── the ledger strip ─────────────────────────────────────────────────────────

const maxDay = computed(() => Math.max(1, ...d.value.ledger.map((x) => x.minutes)));
const fmtHrs = (min: number) => (min % 60 === 0 ? `${min / 60}h` : `${(min / 60).toFixed(1)}h`);
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

const todayIso = new Date().toISOString().slice(0, 10);

// The selected day: null = all-time. When set, the drill panel splits and pins
// all-time beside the day. The state machine (select/close/loading/error) is the
// shared drill composable; only the loader differs from Music.
const drill = useDayDrill<PlaytimeDayResponse["games"]>();
const { selected, data: dayGames, loading: dayLoading, error: dayError, clear } = drill;

// A day with no play is a real answer — resolve [] without a fetch; otherwise ask
// the server for that day's per-game breakdown.
const selectDay = (iso: string, minutes: number) =>
  drill.select(iso, () => (minutes === 0 ? Promise.resolve([]) : fetchPlaytimeDay(iso)));

// The ledger as a single-row heat strip — the same HeatGrid the weekday×hour map
// uses, replacing the old height-bars so the site draws "activity over days" one
// way. The strip is contiguous over the ledger's span (first day → today), empty
// days zero-filled so gaps show instead of collapsing; `ledgerLevel` buckets by
// the day-max (distinct from the weekday×hour `heatLevel`, which buckets by its own).
const strip = computed(() =>
  contiguousDays(d.value.ledger, d.value.ledger[0]?.day ?? todayIso, todayIso),
);
const ledgerLevel = (min: number) => (min === 0 ? 0 : Math.min(4, Math.ceil((min / maxDay.value) * 4)));
const ledgerCells = computed<HeatCell[]>(() =>
  strip.value.map((row) => ({
    level: ledgerLevel(row.minutes),
    today: row.day === todayIso,
    title: `${fmtDay(row.day)} · ${row.minutes ? fmtHrs(row.minutes) : "nothing"}`,
  })),
);
const selectedLedgerIndex = computed(() => {
  if (!selected.value) return null;
  const i = strip.value.findIndex((r) => r.day === selected.value);
  return i >= 0 ? i : null;
});
function onLedgerSelect(i: number) {
  const row = strip.value[i];
  if (row) selectDay(row.day, row.minutes);
}

// ── the heatmap ──────────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"]; // 6 shown; Sat folds visually
// Build a 7×24 grid (Mon-first) from the sparse cells. SQLite %w is Sun=0, so
// rotate to Mon=0.
const HEAT = computed(() => {
  const grid: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const c of d.value.heat) {
    const monFirst = (c.weekday + 6) % 7; // Sun=0 → 6, Mon=1 → 0
    grid[monFirst]![c.hour] = c.minutes;
  }
  return grid;
});
const heatMax = computed(() => Math.max(1, ...d.value.heat.map((c) => c.minutes)));
const heatLevel = (min: number) => (min === 0 ? 0 : Math.min(4, Math.ceil((min / heatMax.value) * 4)));

const now = new Date();
const nowHour = now.getHours();
const nowMonFirst = (now.getDay() + 6) % 7;

// Flatten the 7×24 grid into the shared HeatGrid's cells, column-major (a day per
// column, matching the day labels beside it). Level bucketing stays local — the
// linear quartile above is playtime's own, not the contribution graph's.
const heatCells = computed<HeatCell[]>(() =>
  HEAT.value.flatMap((row, day) =>
    row.map((min, hour) => ({
      level: heatLevel(min),
      today: day === nowMonFirst && hour === nowHour,
      title: `${DAY_LABELS[day] ?? ""} ${String(hour).padStart(2, "0")}:00 · ${min ? fmtHrs(min) : "nothing"}`,
    })),
  ),
);

const hasData = computed(() => d.value.ledger.length > 0 || d.value.heat.length > 0 || recent.value.length > 0);
</script>

<template>
  <section :id="module.id" class="pt">
    <header class="pt-head">
      <h2 class="pt-title">{{ d.heading }}</h2>
      <span v-if="d.note" class="pt-note">{{ d.note }}</span>
    </header>

    <!-- Empty state: a fresh install has no snapshots to difference and no
         sessions yet. Say so plainly rather than drawing an empty grid. -->
    <p v-if="!hasData" class="pt-empty">
      No playtime recorded yet. Games get tracked as they're played; this fills in
      over the coming days.
    </p>

    <template v-else>
      <!-- ── recently played (moved here from "Right now") ── -->
      <div v-if="recent.length" class="pt-recent-wrap">
        <div class="pt-card-h">
          <span class="pt-t">Recently played</span>
          <span class="pt-scope">last 2 weeks</span>
        </div>
        <div class="pt-recent">
          <component
            :is="storeUrl(g.appId) ? 'a' : 'div'"
            v-for="(g, i) in recent"
            :key="g.name"
            class="pt-rrow"
            :class="{ 'pt-r1': i === 0 }"
            v-bind="storeUrl(g.appId) ? { href: storeUrl(g.appId), target: '_blank', rel: 'noreferrer noopener' } : {}"
          >
            <span class="pt-rrank">{{ i + 1 }}</span>
            <img v-if="gameIcon(g.iconUrl)" :src="gameIcon(g.iconUrl)" alt="" class="pt-rart" loading="lazy" />
            <span v-else class="pt-rart pt-rmono" :style="{ background: gameAccent(g.accent) }">{{ g.name.slice(0, 1) }}</span>
            <span class="pt-rbody">
              <span class="pt-rname">{{ g.name }}</span>
              <span class="pt-rsrc">
                <span class="pt-src" :class="g.source === 'steam' ? 'pt-src-steam' : 'pt-src-obs'"></span>
                {{ g.source === "steam" ? "Steam" : "observed" }}
              </span>
            </span>
            <span class="pt-rval">{{ fmtGameHrs(g.minutes) }}<small v-if="!g.exact"> +</small></span>
          </component>
        </div>
      </div>

      <!-- ── the ledger ── -->
      <div v-if="d.ledger.length" class="pt-card">
        <div class="pt-card-h">
          <span class="pt-t">Played</span>
          <span class="pt-scope">
            {{ selected ? fmtDay(selected) : `all-time${d.since ? ` · since ${fmtDay(d.since)}` : ""}` }}
          </span>
        </div>

        <HeatGrid
          :cells="ledgerCells"
          :rows="1"
          :min-cell="8"
          legend
          selectable
          :selected-index="selectedLedgerIndex"
          @select="onLedgerSelect"
        />
        <div class="pt-axis">
          <span class="pt-m">{{ strip[0] ? fmtDay(strip[0].day) : "" }}</span>
          <span class="pt-m">today</span>
        </div>

        <!-- drill: the day (or all-time) on the left, all-time pinned when a day is up -->
        <div class="pt-drill" :class="{ split: selected }">
          <div class="pt-dcol">
            <div class="pt-dh">{{ selected ? fmtDay(selected) : "All time" }}</div>
            <div class="pt-stats">
              <div class="pt-stat"><b>{{ d.totalHours }} h</b><span>all-time, tracked</span></div>
            </div>
            <div v-if="selected">
              <p v-if="dayLoading" class="pt-dim">Loading…</p>
              <p v-else-if="dayError" class="pt-dim">Couldn't load that day.</p>
              <p v-else-if="dayGames && !dayGames.length" class="pt-dim">Nothing recorded this day.</p>
              <div v-else-if="dayGames" class="pt-dgames">
                <div v-for="g in dayGames" :key="g.name" class="pt-dg">
                  <span class="pt-dg-name">{{ g.name }}</span>
                  <span class="pt-dg-hrs">{{ fmtHrs(g.minutes) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="selected" class="pt-dcol pt-pin">
            <div class="pt-dh">All time <span class="pt-m">(for comparison)</span></div>
            <div class="pt-stats">
              <div class="pt-stat"><b>{{ d.totalHours }} h</b><span>tracked</span></div>
            </div>
            <button class="pt-clear" @click="clear">← back to all-time</button>
          </div>
        </div>
      </div>

      <!-- ── the heatmap ── -->
      <div v-if="d.heat.length" class="pt-card">
        <div class="pt-card-h">
          <span class="pt-t">When I play</span>
          <span class="pt-scope">local time</span>
        </div>
        <div class="pt-heatwrap">
          <div class="pt-days">
            <span v-for="lbl in DAY_LABELS" :key="lbl" class="pt-m">{{ lbl }}</span>
          </div>
          <HeatGrid :cells="heatCells" :min-cell="8" />
        </div>
        <div class="pt-axis">
          <span class="pt-m">00:00</span><span class="pt-m">12:00</span><span class="pt-m">23:00</span>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.pt {
  display: flex;
  flex-direction: column;
  gap: var(--sp-16);
}

/* ── recently played: a stacked ranking, matching the Listening rows ── */
.pt-recent-wrap {
  background: var(--surf-1);
  border: 1px solid var(--line-1);
  border-radius: var(--r-card);
  padding: var(--sp-18);
}
.pt-recent {
  margin-top: var(--sp-8);
}
.pt-rrow {
  display: grid;
  grid-template-columns: 18px 34px 1fr auto;
  gap: var(--sp-10);
  align-items: center;
  padding: var(--sp-6) 0;
  border-top: 1px solid var(--line-1);
  text-decoration: none;
  color: inherit;
}
.pt-rrow:first-child {
  border-top: none;
}
a.pt-rrow:hover .pt-rname {
  color: var(--live-ink);
}
.pt-rrank {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  text-align: right;
}
.pt-r1 .pt-rrank {
  color: var(--live-ink);
}
.pt-rart {
  width: 34px;
  height: 34px;
  border-radius: var(--r-chip);
  object-fit: cover;
  display: block;
}
.pt-rmono {
  display: grid;
  place-items: center;
  font-family: var(--f-d);
  font-size: 15px;
  color: var(--ink-strong);
}
.pt-rbody {
  min-width: 0;
}
.pt-rname {
  display: block;
  font-size: var(--fs-body);
  color: var(--ink-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color var(--dur-fast) var(--ease-out);
}
.pt-rsrc {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
.pt-src {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
}
.pt-src-steam {
  background: var(--live-ink);
}
.pt-src-obs {
  background: var(--muted);
}
.pt-rval {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--ink);
  text-align: right;
  white-space: nowrap;
}
.pt-rval small {
  color: var(--muted);
}
.pt-head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-10);
}
.pt-title {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h2);
  color: var(--ink-strong);
}
.pt-note {
  font-size: var(--fs-meta);
  color: var(--muted);
}
.pt-empty {
  color: var(--muted);
  font-size: var(--fs-body);
  padding: var(--sp-16);
  border: 1px dashed var(--line-2);
  border-radius: var(--r-card);
}
.pt-card {
  background: var(--surf-1);
  border: 1px solid var(--line-1);
  border-radius: var(--r-card);
  padding: var(--sp-18);
}
.pt-card-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--sp-12);
}
.pt-t {
  font-family: var(--f-m);
  font-size: 11px;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--muted);
}
.pt-scope {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
.pt-m {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}

.pt-axis {
  display: flex;
  justify-content: space-between;
  margin-top: var(--sp-6);
}

/* the drill panel */
.pt-drill {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--sp-14);
  margin-top: var(--sp-14);
}
.pt-drill.split {
  grid-template-columns: 1fr 1fr;
}
.pt-dh {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h3);
  color: var(--ink-strong);
  margin-bottom: var(--sp-8);
}
.pt-pin {
  border-left: 1px solid var(--line-1);
  padding-left: var(--sp-14);
}
.pt-stats {
  display: grid;
  grid-auto-flow: column;
  gap: var(--sp-10);
  justify-content: start;
}
.pt-stat {
  background: var(--surf-2);
  border: 1px solid var(--line-1);
  border-radius: var(--r-control);
  padding: var(--sp-8) var(--sp-12);
}
.pt-stat b {
  font-family: var(--f-m);
  font-size: 19px;
  font-weight: 700;
  color: var(--ink-strong);
  display: block;
}
.pt-stat span {
  font-size: var(--fs-micro);
  color: var(--muted);
}
.pt-dgames {
  margin-top: var(--sp-10);
}
.pt-dg {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-8);
  padding: var(--sp-4) 0;
  font-size: var(--fs-meta);
}
.pt-dg-hrs {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
.pt-dim {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  margin-top: var(--sp-10);
}
.pt-clear {
  margin-top: var(--sp-12);
  font: inherit;
  font-size: var(--fs-meta);
  background: none;
  border: 0;
  color: var(--live-ink);
  cursor: pointer;
  padding: 0;
}

/* heatmap — the .heat component's shape */
.pt-heatwrap {
  display: flex;
  gap: var(--sp-8);
}
.pt-days {
  display: grid;
  grid-template-rows: repeat(6, 1fr);
  gap: 3px;
  flex: none;
  padding-top: 1px;
}
.pt-days span {
  line-height: 1;
}
/* The grid itself is HeatGrid now; it just needs to fill the row beside the day
   labels (the old .pt-heat carried `flex: 1` for the same reason). */
.pt-heatwrap > :deep(.hg) {
  flex: 1;
  min-width: 0;
}

@media (max-width: 560px) {
  .pt-drill.split {
    grid-template-columns: 1fr;
  }
  .pt-pin {
    border-left: 0;
    border-top: 1px solid var(--line-1);
    padding-left: 0;
    padding-top: var(--sp-12);
  }
}
@media (prefers-reduced-motion: reduce) {
  .pt-col {
    transition: none;
  }
}
</style>
