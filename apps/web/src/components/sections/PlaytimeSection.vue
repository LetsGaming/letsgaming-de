<script setup lang="ts">
/**
 * The playtime module — a fortnight of what I've been playing, from observed
 * `presence_sessions`. Built to mirror `MusicSection`: both are the accumulated
 * past, not the live "Right now" card. Header + total, a top-games list, and a
 * per-day drill-in over a contiguous-fortnight heat strip.
 *
 * The mirror is literal now: the strip + drill wiring is `useLedgerStrip`, the row
 * is `RankedRow`, the stat tile `StatTile`, the timeline `HeatStrip` — all shared
 * with Listening. One list rather than two (a play has only the game where a
 * listen has a song and an artist), so the stats are inert tiles, not tabs. Cover
 * art and genre come from RAWG, matched by name, served through the shared media
 * proxy; a monogram stands in where there's no cover.
 */
import { computed, ref } from "vue";
import type { PlaytimeDayResponse, ResolvedModule } from "@lg/core";
import { presenceMediaUrl } from "../../lib/api";
import { fmtDay } from "../../lib/calendar";
import { fetchPlaytimeDay } from "../../lib/playtime-api";
import { useLiveModule } from "../../composables/useLiveModule";
import { useLedgerStrip } from "../../composables/useLedgerStrip";
import RankedRow from "../ui/RankedRow.vue";
import StatTile from "../ui/StatTile.vue";
import HeatStrip from "../ui/HeatStrip.vue";
import HeatGrid, { type HeatCell } from "../ui/HeatGrid.vue";

const props = defineProps<{ module: Extract<ResolvedModule, { kind: "playtime" }> }>();
// Polls `/api/module/:id` so playtime refreshes in place, starting from SSR data.
const { data: liveData } = useLiveModule(props.module.id, "playtime", props.module.data);
const d = computed(() => liveData.value);

const TOP_SHOWN = 5;
const fmtHrs = (min: number) => {
  const h = min / 60;
  return (h >= 10 || h % 1 === 0 ? Math.round(h) : h.toFixed(1)) + "h";
};

// The clickable fortnight timeline + day drill-in — shared with Listening.
const { selected, dayData: dayGames, dayLoading, dayError, dayExpanded, strip, cells, selectedIndex, onSelect, clear } =
  useLedgerStrip<PlaytimeDayResponse["games"]>({
    ledger: () => d.value.ledger,
    fetchDay: fetchPlaytimeDay,
    emptyDay: [],
    title: (day, min) => `${fmtDay(day)} · ${min ? fmtHrs(min) : "nothing"}`,
  });
const stripStart = computed(() => (strip.value[0] ? fmtDay(strip.value[0].day) : ""));

// The top-games list.
const games = computed(() => d.value.recent ?? []);
const expanded = ref(false);
const shownGames = computed(() => (expanded.value ? games.value : games.value.slice(0, TOP_SHOWN)));
const hiddenCount = computed(() => Math.max(0, games.value.length - TOP_SHOWN));
const gameCount = computed(() => games.value.length);

// The day panel rows.
const dayRowsAll = computed(() => dayGames.value ?? []);
const shownDayRows = computed(() => (dayExpanded.value ? dayRowsAll.value : dayRowsAll.value.slice(0, TOP_SHOWN)));
const dayHidden = computed(() => Math.max(0, dayRowsAll.value.length - TOP_SHOWN));
const dayMinutes = computed(() => dayRowsAll.value.reduce((s, g) => s + g.minutes, 0));
const dayGameCount = computed(() => dayRowsAll.value.length);

const cover = (url?: string) => (url ? presenceMediaUrl({ url }) : undefined);

// ── the weekday×hour heatmap ("when I play") ──────────────────────────────────
// A second card, and Playtime's own — Listening has no equivalent. The day strip
// answers "how much, per day"; this answers "at what time of day".
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Build a 7×24 grid (Mon-first) from the sparse cells. SQLite's %w is Sun=0, so
// rotate to Mon=0.
const heatGrid = computed(() => {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const c of d.value.heat) grid[(c.weekday + 6) % 7]![c.hour] = c.minutes;
  return grid;
});
const heatMax = computed(() => Math.max(1, ...d.value.heat.map((c) => c.minutes)));
const heatLevel = (min: number) => (min === 0 ? 0 : Math.min(4, Math.ceil((min / heatMax.value) * 4)));

const now = new Date();
const nowHour = now.getHours();
const nowDay = (now.getDay() + 6) % 7;

// Cells for HeatGrid, hour-major: column-flow fills each column top-to-bottom, so
// with 7 rows a column is one hour down the week (Mon→Sun) and the 24 columns are
// the hours. That makes it a true weekday×hour matrix rather than a wrapped
// timeline.
const heatCells = computed<HeatCell[]>(() => {
  const out: HeatCell[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let day = 0; day < 7; day++) {
      const min = heatGrid.value[day]?.[hour] ?? 0;
      out.push({
        level: heatLevel(min),
        today: day === nowDay && hour === nowHour,
        title: `${DAYS[day]} ${String(hour).padStart(2, "0")}:00 · ${min ? fmtHrs(min) : "nothing"}`,
      });
    }
  }
  return out;
});

const hasData = computed(() => d.value.ledger.length > 0 || games.value.length > 0 || d.value.heat.length > 0);
</script>

<template>
  <section :id="module.id" class="pt">
    <header class="pt-head">
      <h2 class="pt-title">{{ d.heading }}</h2>
      <span v-if="d.note" class="pt-note">{{ d.note }}</span>
    </header>

    <p v-if="!hasData" class="pt-empty">
      Nothing recorded yet. Games show up here after the presence sampler catches
      you playing — give it a day.
    </p>

    <template v-else>
      <div class="pt-card">
      <div class="pt-card-h">
        <span class="pt-t">Played</span>
        <span class="pt-scope">{{ selected ? fmtDay(selected) : "last 14 days" }}</span>
      </div>

      <!-- Two inert stats — a play has one dimension (the game), so unlike
           Listening's song/artist tabs there's nothing to switch between. -->
      <div class="pt-stats">
        <StatTile :value="d.totalHours" unit="h" label="time played" />
        <StatTile :value="gameCount" :label="gameCount === 1 ? 'game' : 'games'" />
      </div>

      <HeatStrip
        v-if="d.ledger.length"
        :cells="cells"
        :selected-index="selectedIndex"
        :start-label="stripStart"
        @select="onSelect"
      />

      <!-- One content region: the top-games list, or a day's games. -->
      <div class="pt-panel">
        <div class="pt-panel-h">
          <h3>{{ selected ? fmtDay(selected) : "Top games" }}</h3>
          <button v-if="selected" class="pt-back" @click="clear">← back to top games</button>
        </div>

        <!-- a day's games -->
        <template v-if="selected">
          <p v-if="dayLoading" class="pt-dim">Loading…</p>
          <p v-else-if="dayError" class="pt-dim">Couldn't load that day.</p>
          <p v-else-if="!dayGameCount" class="pt-dim pt-day-empty">Nothing played this day.</p>
          <template v-else>
            <p class="pt-day-sum">{{ fmtHrs(dayMinutes) }} · {{ dayGameCount }} game{{ dayGameCount > 1 ? "s" : "" }}</p>
            <RankedRow
              v-for="(g, i) in shownDayRows"
              :key="g.name"
              :rank="i + 1"
              :name="g.name"
              :subtitle="g.genre"
              :art="cover(g.coverUrl)"
              :highlight="i === 0"
              fallback="🎮"
            >
              {{ fmtHrs(g.minutes) }}<small v-if="!g.exact"> +</small>
            </RankedRow>
            <button v-if="dayHidden > 0" class="pt-more" @click="dayExpanded = !dayExpanded">
              {{ dayExpanded ? "show less" : `show ${dayHidden} more` }}
            </button>
          </template>
        </template>

        <!-- the top-games list -->
        <template v-else>
          <RankedRow
            v-for="(g, i) in shownGames"
            :key="g.name"
            :rank="i + 1"
            :name="g.name"
            :subtitle="g.genre"
            :art="cover(g.coverUrl)"
            :highlight="i === 0"
            fallback="🎮"
          >
            {{ fmtHrs(g.minutes) }}<small v-if="!g.exact"> +</small>
          </RankedRow>
          <button v-if="hiddenCount > 0" class="pt-more" @click="expanded = !expanded">
            {{ expanded ? "show less" : `show ${hiddenCount} more` }}
          </button>
        </template>
      </div>
    </div>

      <!-- ── the weekday×hour heatmap: Playtime's own second card ── -->
      <div v-if="d.heat.length" class="pt-card">
        <div class="pt-card-h">
          <span class="pt-t">When I play</span>
          <span class="pt-scope">local time</span>
        </div>
        <div class="pt-heat">
          <div class="pt-heat-days"><span v-for="dl in DAYS" :key="dl">{{ dl }}</span></div>
          <div class="pt-heat-plot">
            <HeatGrid :cells="heatCells" :min-cell="8" />
            <div class="pt-heat-axis"><span>00:00</span><span>12:00</span><span>23:00</span></div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.pt {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--sp-16);
}
.pt-head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-10);
  margin-bottom: var(--sp-14);
}
.pt-title {
  font-family: var(--f-d);
  font-size: var(--fs-h2);
  color: var(--ink-strong);
}
.pt-note {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
.pt-empty {
  color: var(--muted);
  font-size: var(--fs-body);
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
  gap: var(--sp-12);
  margin-bottom: var(--sp-14);
}
.pt-t {
  font-family: var(--f-d);
  font-size: var(--fs-h3);
  color: var(--ink-strong);
}
.pt-scope {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--live-ink);
}
.pt-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-10);
  margin-bottom: var(--sp-16);
}
.pt-panel-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-10);
  margin-bottom: var(--sp-8);
}
.pt-panel-h h3 {
  font-family: var(--f-d);
  font-size: var(--fs-h3);
  color: var(--ink-strong);
}
.pt-back {
  font: inherit;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0;
}
.pt-back:hover {
  color: var(--ink);
}
.pt-more {
  font: inherit;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--live-ink);
  background: none;
  border: 0;
  cursor: pointer;
  padding: var(--sp-8) 0 0;
}
.pt-more:hover {
  text-decoration: underline;
}
.pt-dim {
  color: var(--muted);
  font-size: var(--fs-meta);
  padding: var(--sp-8) 0;
}
.pt-day-empty {
  text-align: center;
  padding: var(--sp-16) 0;
}
.pt-day-sum {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  margin-bottom: var(--sp-4);
}

/* ── weekday×hour heatmap: day labels beside a 24-column grid, hour axis below.
   The labels mirror HeatGrid's row structure (7 rows, 3px gap, 4px pad) so they
   line up with the cell rows. ── */
.pt-heat {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--sp-8);
  align-items: stretch;
}
.pt-heat-days {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  gap: 3px;
  padding: 4px 0;
  font-family: var(--f-m);
  font-size: 9px;
  color: var(--muted);
}
.pt-heat-days span {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.pt-heat-axis {
  display: flex;
  justify-content: space-between;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  margin-top: var(--sp-6);
  padding: 0 4px;
}
</style>
