<script setup lang="ts">
import { useT } from "~/composables/useT";
/**
 * The music module — Spotify listening over a chosen window, from `music_plays`.
 *
 * Sibling to `PlaytimeSection`, and built to mirror it: both are the accumulated
 * past, not the live card. The strip + drill wiring is the shared `useLedgerStrip`,
 * the row is `RankedRow`, the stat tiles `StatTile`, the timeline `HeatStrip`. The
 * shell, card, header and list footer are the shared module primitives.
 *
 * What's Music's own: two lists, not one. The stats double as tabs — "tracks
 * played" reveals the songs, "different artists" the artists, one content region
 * taking turns; "time listening" is inert (no list behind a duration). The day
 * drill respects that choice via `dayRowsFor`: click a day on "different artists"
 * and you get *that day's artists*, not its raw tracks. Genre and podcast-vs-music
 * are absent by construction — Discord's Spotify presence exposes neither.
 */
import { computed, ref, watch } from "vue";
import {
  type ActivityRange,
  type DayRow,
  type ListKind,
  type MusicDayResponse,
  type MusicRankView,
  type ResolvedModule,
} from "@lg/core";
import { presenceMediaUrl } from "../../lib/api";
import { fetchMusicDay } from "../../lib/day-api";
import { useLiveModule } from "../../composables/useLiveModule";
import { useLedgerStrip } from "../../composables/useLedgerStrip";
import { useLimitedList } from "../../composables/useLimitedList";
import ModuleSection from "../ui/ModuleSection.vue";
import ListFooter from "../ui/ListFooter.vue";
import RankedRow from "../ui/RankedRow.vue";
import StatTile from "../ui/StatTile.vue";
import Duration from "../ui/Duration.vue";
import HeatStrip from "../ui/HeatStrip.vue";
import DrillPanel from "../ui/DrillPanel.vue";
import ActivityRangePicker from "../ui/ActivityRangePicker.vue";

const { t, plural, day } = useT();

const props = defineProps<{ module: Extract<ResolvedModule, { kind: "music" }> }>();
// How far back the card looks — the twin of Played's picker, with its own stored
// default so the two can open on different windows. Not persisted; see the picker.
const range = ref<ActivityRange>(props.module.data.windowDays);

// Polls `/api/module/:id` so the module refreshes in place, starting from SSR data,
// over `range` — a longer window is rebuilt on the server, not re-sliced here.
const { data: liveData, refresh } = useLiveModule(
  props.module.id,
  "music",
  props.module.data,
  undefined,
  () => range.value,
);
const d = computed(() => liveData.value);
// Pick a new window: re-fetch now rather than waiting out the poll interval.
watch(range, () => void refresh());

// The clickable fortnight timeline + day drill-in — shared with Playtime. The day
// response arrives pre-aggregated and pre-capped: `songs`/`artists` already trimmed
// to maxCount server-side, with the true counts alongside.
const EMPTY_DAY: MusicDayResponse = { day: "", minutes: 0, trackCount: 0, artistCount: 0, songs: [], artists: [] };
const {
  selected,
  dayData,
  dayLoading,
  dayError,
  dayExpanded,
  strip,
  cells,
  selectedIndex,
  layout,
  onSelect,
  clear,
} = useLedgerStrip<MusicDayResponse>({
  ledger: () => d.value.ledger,
  fetchDay: (iso) => fetchMusicDay(iso, d.value.timeZone),
  emptyDay: EMPTY_DAY,
  title: (iso, min) => `${day(iso)} · ${min} min`,
  // The window the data covers, not the one being requested — see PlaytimeSection.
  days: () => d.value.windowDays,
  timeZone: () => d.value.timeZone,
});
const stripStart = computed(() => (strip.value[0] ? day(strip.value[0].day) : ""));

// Which list backs the panel (songs or artists).
const list = ref<ListKind>("songs");
const activeRows = computed<MusicRankView[]>(() => (list.value === "songs" ? d.value.topSongs : d.value.topArtists));
// The main list: the server already trims to maxCount, and the true total (distinct
// songs/artists over the window) drives the "and N more" the cap hides.
const listTotal = computed(() => (list.value === "songs" ? d.value.trackCount : d.value.artistCount));
const {
  shown: mainRows,
  expanded: mainOpen,
  moreCount: mainMore,
  overflow: mainOver,
  atCap: mainAtCap,
  reset: resetMain,
} = useLimitedList({
  rows: activeRows,
  initial: () => d.value.initialCount,
  max: () => d.value.maxCount,
  total: listTotal,
});

function showList(which: ListKind) {
  list.value = which;
  resetMain();
  clear();
}

// The day panel rows, following the active tab — already capped server-side, with
// the true per-view total shipped for "and N more". Reuses the strip's expanded ref,
// which resets when the selected day changes.
const dayRowsAll = computed<DayRow[]>(() =>
  dayData.value ? (list.value === "songs" ? dayData.value.songs : dayData.value.artists) : [],
);
const dayListTotal = computed(() =>
  dayData.value ? (list.value === "songs" ? dayData.value.trackCount : dayData.value.artistCount) : 0,
);
const {
  shown: dayRows,
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

// Day summary counts, shipped by the server (independent of the active tab).
const dayTrackCount = computed(() => dayData.value?.trackCount ?? 0);
const dayMinutes = computed(() => dayData.value?.minutes ?? 0);
const dayArtistCount = computed(() => dayData.value?.artistCount ?? 0);

const artSrc = (url?: string) => (url ? presenceMediaUrl({ url }) : undefined);
const hasData = computed(() => d.value.ledger.length > 0 || d.value.topSongs.length > 0);
</script>

<template>
  <ModuleSection :id="module.id" :heading="d.heading" :note="d.note">
    <p v-if="!hasData" class="mu-empty">
      {{ t("emptyMusic") }}
    </p>

    <template v-else>
      <div class="mu-bar">
        <span v-if="selected" class="mu-scope">{{ day(selected) }}</span>
        <ActivityRangePicker v-else v-model="range" :window-days="d.windowDays" />
      </div>

      <div class="mu-stats">
        <StatTile :label='t("timeListening")'>
          <template #value><Duration :minutes="d.totalHours * 60" /></template>
        </StatTile>
        <StatTile
          :value="d.trackCount"
          :label='t("tracksPlayed")'
          interactive
          :active="list === 'songs'"
          @select="showList('songs')"
        />
        <StatTile
          :value="d.artistCount"
          :label='t("differentArtists")'
          interactive
          :active="list === 'artists'"
          @select="showList('artists')"
        />
      </div>

      <HeatStrip
        v-if="d.ledger.length"
        :cells="cells"
        :selected-index="selectedIndex"
        :start-label="stripStart"
        :rows="layout.rows"
        :cell-height="layout.cellHeight"
        @select="onSelect"
      />

      <DrillPanel
        :title='t(list === "songs" ? "topSongs" : "topArtists")'
        :day-title="selected ? day(selected) : ''"
        :back-label='t(list === "songs" ? "backToTopSongs" : "backToTopArtists")'
        :selected="selected"
        :loading="dayLoading"
        :error="dayError"
        :has-day="dayTrackCount > 0"
        :empty-label='t("emptyDayMusic")'
        @back="clear"
      >
        <template #summary>
          <Duration :minutes="dayMinutes" /> · {{ dayTrackCount }} {{ plural("track", dayTrackCount) }} ·
          {{ dayArtistCount }} {{ plural("artist", dayArtistCount) }}
        </template>

        <template #day>
          <RankedRow
            v-for="(row, i) in dayRows"
            :key="row.key"
            :rank="i + 1"
            :name="row.primary"
            :subtitle="row.secondary"
            :art="artSrc(row.art)"
            :highlight="i === 0"
          >
            <Duration :minutes="row.minutes" /><small> · {{ row.plays }}×</small>
          </RankedRow>
          <ListFooter
            :more-count="dayMore"
            :expanded="dayExpanded"
            :overflow="dayAtCap ? dayOver : 0"
            @toggle="dayExpanded = !dayExpanded"
          />
        </template>

        <RankedRow
          v-for="(r, i) in mainRows"
          :key="`${r.name}-${i}`"
          :rank="i + 1"
          :name="r.name"
          :subtitle="r.by"
          :art="artSrc(r.artUrl)"
          :highlight="i === 0"
        >
          <Duration :minutes="r.minutes" /><small> · {{ r.plays }}×</small>
        </RankedRow>
        <ListFooter
          :more-count="mainMore"
          :expanded="mainOpen"
          :overflow="mainAtCap ? mainOver : 0"
          @toggle="mainOpen = !mainOpen"
        />
      </DrillPanel>
    </template>
  </ModuleSection>
</template>

<style scoped>
.mu-empty {
  color: var(--muted);
  font-size: var(--fs-body);
}
.mu-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-4);
}
.mu-scope {
  font-family: var(--f-b);
  font-size: var(--fs-meta);
  color: var(--muted);
}
.mu-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--space-4) var(--space-5);
  margin-bottom: var(--space-6);
}
</style>
