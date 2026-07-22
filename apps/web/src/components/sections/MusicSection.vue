<script setup lang="ts">
import { useT } from "~/composables/useT";
/**
 * The music module — a fortnight of Spotify listening, from `music_plays`.
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
import { computed, ref } from "vue";
import { type DayRow, type ListKind, type MusicDayResponse, type MusicRankView, type ResolvedModule } from "@lg/core";
import { presenceMediaUrl } from "../../lib/api";
import { fmtDay } from "../../lib/calendar";
import { fetchMusicDay } from "../../lib/day-api";
import { useLiveModule } from "../../composables/useLiveModule";
import { useLedgerStrip } from "../../composables/useLedgerStrip";
import { useLimitedList } from "../../composables/useLimitedList";
import ModuleSection from "../ui/ModuleSection.vue";
import ModuleCard from "../ui/ModuleCard.vue";
import CardHeader from "../ui/CardHeader.vue";
import ListFooter from "../ui/ListFooter.vue";
import RankedRow from "../ui/RankedRow.vue";
import StatTile from "../ui/StatTile.vue";
import Duration from "../ui/Duration.vue";
import HeatStrip from "../ui/HeatStrip.vue";
import DrillPanel from "../ui/DrillPanel.vue";

const { t, plural } = useT();

const props = defineProps<{ module: Extract<ResolvedModule, { kind: "music" }> }>();
// Polls `/api/module/:id` so the module refreshes in place, starting from SSR data.
const { data: liveData } = useLiveModule(props.module.id, "music", props.module.data);
const d = computed(() => liveData.value);

// The clickable fortnight timeline + day drill-in — shared with Playtime. The day
// response arrives pre-aggregated and pre-capped: `songs`/`artists` already trimmed
// to maxCount server-side, with the true counts alongside.
const EMPTY_DAY: MusicDayResponse = { day: "", minutes: 0, trackCount: 0, artistCount: 0, songs: [], artists: [] };
const { selected, dayData, dayLoading, dayError, dayExpanded, strip, cells, selectedIndex, onSelect, clear } =
  useLedgerStrip<MusicDayResponse>({
    ledger: () => d.value.ledger,
    fetchDay: (iso) => fetchMusicDay(iso, d.value.timeZone),
    emptyDay: EMPTY_DAY,
    title: (day, min) => `${fmtDay(day)} · ${min} min`,
    timeZone: () => d.value.timeZone,
  });
const stripStart = computed(() => (strip.value[0] ? fmtDay(strip.value[0].day) : ""));

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
    <!-- Empty state: nothing recorded until the sampler catches Spotify playing. -->
    <p v-if="!hasData" class="mu-empty">
      {{ t("emptyMusic") }}
    </p>

    <ModuleCard v-else>
      <CardHeader
        as="span"
        tone="live"
        :title='t("listening")'
        :note='selected ? fmtDay(selected) : t("lastFourteenDays")'
      />

      <!-- Stats double as tabs. "time listening" is inert (no list behind it). -->
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
        @select="onSelect"
      />

      <!-- One content region: a top list, or a day's rows (tracks or artists). -->
      <DrillPanel
        :title='t(list === "songs" ? "topSongs" : "topArtists")'
        :day-title="selected ? fmtDay(selected) : ''"
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

        <!-- a day's rows -->
        <template #day>
          <RankedRow
            v-for="(row, i) in dayRows"
            :key="row.key"
            :rank="i + 1"
            :name="row.primary"
            :subtitle="row.secondary"
            :art="artSrc(row.art)"
            :highlight="i === 0"
            fallback="♪"
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

        <!-- a top list -->
        <RankedRow
          v-for="(r, i) in mainRows"
          :key="`${r.name}-${i}`"
          :rank="i + 1"
          :name="r.name"
          :subtitle="r.by"
          :art="artSrc(r.artUrl)"
          :highlight="i === 0"
          fallback="♪"
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
    </ModuleCard>
  </ModuleSection>
</template>

<style scoped>
/* Music's own bits only. Everything structural is a shared primitive now — the
   shell, card and header (ModuleSection / ModuleCard / CardHeader), the capped
   list (ListFooter), and the whole drill region including its back control and
   status lines (DrillPanel). What's left is the empty state and the three-up
   stat/tab grid, which is Music's alone: its stats double as tabs. */
.mu-empty {
  color: var(--muted);
  font-size: var(--fs-body);
}
.mu-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-10);
  margin-bottom: var(--sp-16);
}
</style>
