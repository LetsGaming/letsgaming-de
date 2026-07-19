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
const hasData = computed(() => d.value.ledger.length > 0 || games.value.length > 0);
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

    <div v-else class="pt-card">
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
  </section>
</template>

<style scoped>
.pt {
  container-type: inline-size;
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
</style>
