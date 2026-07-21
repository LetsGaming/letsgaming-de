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
import { computed, onMounted, ref, watch } from "vue";
import type { PlaytimeDayResponse, ResolvedModule } from "@lg/core";
import { presenceMediaUrl } from "../../lib/api";
import { fmtDay } from "../../lib/calendar";
import { fetchPlaytimeDay } from "../../lib/playtime-api";
import { useLiveModule } from "../../composables/useLiveModule";
import { useLedgerStrip } from "../../composables/useLedgerStrip";
import { useLimitedList } from "../../composables/useLimitedList";
import ModuleSection from "../ui/ModuleSection.vue";
import ModuleCard from "../ui/ModuleCard.vue";
import CardHeader from "../ui/CardHeader.vue";
import ListFooter from "../ui/ListFooter.vue";
import RankedRow from "../ui/RankedRow.vue";
import StatTile from "../ui/StatTile.vue";
import HeatStrip from "../ui/HeatStrip.vue";
import HeatGrid, { type HeatCell } from "../ui/HeatGrid.vue";

const props = defineProps<{ module: Extract<ResolvedModule, { kind: "playtime" }> }>();

// Which zone the module is shown in. The backend buckets in a zone and ships it;
// by default that's the owner's (what SSR sent). A visitor can flip to their own
// local time, which re-requests the module bucketed in their zone — exact, not a
// client-side rotation. The owner's zone is captured from the SSR data up front.
const ownerZone = props.module.data.timeZone;
const viewerZone = ref<string | null>(null);
onMounted(() => {
  viewerZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
});
const mode = ref<"owner" | "local">("owner");
const requestedZone = computed(() => (mode.value === "local" && viewerZone.value ? viewerZone.value : ownerZone));
// The toggle only earns its place when the viewer's zone differs from the owner's —
// otherwise both views are identical. Known only after mount, so it appears a beat
// after load (and, for the owner, never).
const showZoneToggle = computed(() => !!viewerZone.value && viewerZone.value !== ownerZone);

// Polls `/api/module/:id` so playtime refreshes in place, starting from SSR data —
// in `requestedZone`, so a flip re-buckets on the server.
const { data: liveData, refresh } = useLiveModule(
  props.module.id,
  "playtime",
  props.module.data,
  () => requestedZone.value,
);
const d = computed(() => liveData.value);
// Flip owner↔local: re-fetch straight away rather than waiting for the next poll.
watch(mode, () => void refresh());

const fmtHrs = (min: number) => {
  const h = min / 60;
  return (h >= 10 || h % 1 === 0 ? Math.round(h) : h.toFixed(1)) + "h";
};

// The clickable fortnight timeline + day drill-in — shared with Listening. The
// strip's window and drill-in run in the data's zone (`d.timeZone`), so a flip
// moves them with the heatmap. The day response is pre-capped to maxCount, with the
// true distinct-game total and the day's real minutes alongside.
const EMPTY_DAY: PlaytimeDayResponse = { day: "", games: [], total: 0, minutes: 0 };
const { selected, dayData, dayLoading, dayError, dayExpanded, strip, cells, selectedIndex, onSelect, clear } =
  useLedgerStrip<PlaytimeDayResponse>({
    ledger: () => d.value.ledger,
    fetchDay: (iso) => fetchPlaytimeDay(iso, d.value.timeZone),
    emptyDay: EMPTY_DAY,
    title: (day, min) => `${fmtDay(day)} · ${min ? fmtHrs(min) : "nothing"}`,
    timeZone: () => d.value.timeZone,
  });
const stripStart = computed(() => (strip.value[0] ? fmtDay(strip.value[0].day) : ""));

// The top-games list. The server caps `recent` at maxCount (the client never sees
// past the cap); gameCount is the true total, for the headline and "and N more".
const games = computed(() => d.value.recent ?? []);
const gameCount = computed(() => d.value.gameCount);
const {
  shown: shownGames,
  expanded: gamesOpen,
  moreCount: gamesMore,
  overflow: gamesOver,
  atCap: gamesAtCap,
} = useLimitedList({
  rows: games,
  initial: () => d.value.initialCount,
  max: () => d.value.maxCount,
  total: gameCount,
});

// The day panel rows — already capped server-side, with the true distinct-game
// total shipped for "and N more". Reuses the strip's expanded ref (resets on day
// change).
const dayRowsAll = computed(() => dayData.value?.games ?? []);
const dayListTotal = computed(() => dayData.value?.total ?? 0);
const {
  shown: shownDayRows,
  moreCount: dayMore,
  overflow: dayOver,
  atCap: dayAtCap,
} = useLimitedList({
  rows: dayRowsAll,
  initial: () => d.value.initialCount,
  max: () => d.value.maxCount,
  total: dayListTotal,
  expanded: dayExpanded,
});
const dayMinutes = computed(() => dayData.value?.minutes ?? 0);
const dayGameCount = computed(() => dayData.value?.total ?? 0);

const cover = (url?: string) => (url ? presenceMediaUrl({ url }) : undefined);

// ── the weekday×hour heatmap ("when I play") ──────────────────────────────────
// A second card, and Playtime's own — Listening has no equivalent. The day strip
// answers "how much, per day"; this answers "at what time of day".
//
// The grid arrives already bucketed in the display zone — the backend aggregated
// it there from the raw sessions (owner's zone by default, the viewer's when the
// module is flipped to local). So it renders straight, no client re-projection:
// what you see is an exact, DST-correct grid for whichever zone `d.timeZone` is.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Build the 7×24 grid (Mon-first) from the sparse cells. `%w` is Sun=0, rotate to
// Mon=0.
const heatGrid = computed(() => {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const c of d.value.heat) grid[(c.weekday + 6) % 7]![c.hour] = c.minutes;
  return grid;
});
const heatMax = computed(() => Math.max(1, ...d.value.heat.map((c) => c.minutes)));
const heatLevel = (min: number) => (min === 0 ? 0 : Math.min(4, Math.ceil((min / heatMax.value) * 4)));

// "now" in the grid's zone (`d.timeZone`), so the marker lands on the right cell in
// either view. Held back until mount so SSR and the first client render agree.
const nowMarker = computed(() => {
  if (!viewerZone.value) return { day: -1, hour: -1 };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: d.value.timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { day: DAYS.indexOf(wd), hour: Number(parts.find((p) => p.type === "hour")?.value ?? -1) };
});

// The card's zone label: "local time" when it is the viewer's (either the toggle is
// hidden because the zones match, or they've flipped to local); otherwise the
// owner's city, so an out-of-zone visitor isn't misled.
const ownerCity = ownerZone.split("/").pop()?.replace(/_/g, " ") ?? ownerZone;
const zoneLabel = computed(() => (!showZoneToggle.value || mode.value === "local" ? "local time" : `${ownerCity} time`));

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
        today: day === nowMarker.value.day && hour === nowMarker.value.hour,
        title: `${DAYS[day]} ${String(hour).padStart(2, "0")}:00 · ${min ? fmtHrs(min) : "nothing"}`,
      });
    }
  }
  return out;
});

const hasData = computed(() => d.value.ledger.length > 0 || games.value.length > 0 || d.value.heat.length > 0);
</script>

<template>
  <ModuleSection :id="module.id" :heading="d.heading" :note="d.note">
    <p v-if="!hasData" class="pt-empty">
      Nothing recorded yet. Games show up here after the presence sampler catches
      you playing — give it a day.
    </p>

    <div v-else class="pt-cards">
      <ModuleCard>
      <CardHeader
        as="span"
        tone="live"
        title="Played"
        :note="selected ? fmtDay(selected) : 'last 14 days'"
      />

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
        <CardHeader :title="selected ? fmtDay(selected) : 'Top games'">
          <template #note>
            <button v-if="selected" class="pt-back" @click="clear">← back to top games</button>
          </template>
        </CardHeader>

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
            <ListFooter
              :more-count="dayMore"
              :expanded="dayExpanded"
              :overflow="dayAtCap ? dayOver : 0"
              @toggle="dayExpanded = !dayExpanded"
            />
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
          <ListFooter
            :more-count="gamesMore"
            :expanded="gamesOpen"
            :overflow="gamesAtCap ? gamesOver : 0"
            @toggle="gamesOpen = !gamesOpen"
          />
        </template>
      </div>
    </ModuleCard>

      <!-- ── the weekday×hour heatmap: Playtime's own second card ── -->
      <ModuleCard v-if="d.heat.length">
        <CardHeader as="span" title="When I play">
          <template #note>
            <span v-if="!showZoneToggle" class="pt-scope">{{ zoneLabel }}</span>
            <span v-else class="pt-zone" role="group" aria-label="Show times in">
              <button type="button" class="pt-zone-b" :class="{ on: mode === 'owner' }" @click="mode = 'owner'">
                {{ ownerCity }}
              </button>
              <button type="button" class="pt-zone-b" :class="{ on: mode === 'local' }" @click="mode = 'local'">
                Local
              </button>
            </span>
          </template>
        </CardHeader>
        <div class="pt-heat">
          <div class="pt-heat-days"><span v-for="dl in DAYS" :key="dl">{{ dl }}</span></div>
          <div class="pt-heat-plot">
            <HeatGrid :cells="heatCells" :min-cell="8" :cell-height="13" legend />
            <div class="pt-heat-axis"><span>00:00</span><span>12:00</span><span>23:00</span></div>
          </div>
        </div>
      </ModuleCard>
    </div>
  </ModuleSection>
</template>

<style scoped>
/* Playtime's own bits only. The shell, cards, card headers, and list footers are
   shared primitives (ModuleSection / ModuleCard / CardHeader / ListFooter). What
   stays: the empty state, the two-card stack, the two-up stat grid, the day-drill
   back button + status/summary lines, the timezone toggle, and the heatmap. */
.pt-cards {
  display: flex;
  flex-direction: column;
  gap: var(--sp-16);
}
.pt-empty {
  color: var(--muted);
  font-size: var(--fs-body);
}
/* Card-2's zone label matches CardHeader's live note (card-1 uses that note
   directly; here it's a slot, since the note is either this label or the toggle). */
.pt-scope {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--live-ink);
}
/* The owner/local timezone toggle — a small segmented control, shown only to a
   visitor whose zone differs from the owner's. */
.pt-zone {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  background: var(--bg-base);
}
.pt-zone-b {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  background: none;
  border: 0;
  border-radius: var(--r-xs);
  padding: 1px var(--sp-6);
  cursor: pointer;
}
.pt-zone-b:hover {
  color: var(--ink);
}
.pt-zone-b.on {
  color: var(--live-ink);
  background: var(--card-2);
}
.pt-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-10);
  margin-bottom: var(--sp-16);
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
   `align-items: start` keeps the labels pinned to the top (the grid), not
   stretched over the legend + axis below it; the fixed 13px rows + 3px gap + 4px
   pad mirror the grid's fixed-height cells (`:cell-height="13"`) so the seven
   labels line up with the seven cell rows exactly. ── */
.pt-heat {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--sp-8);
  align-items: start;
}
.pt-heat-days {
  display: grid;
  grid-template-rows: repeat(7, 13px);
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
