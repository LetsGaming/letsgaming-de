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
import HeatStrip from "../ui/HeatStrip.vue";

const { t } = useT();

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
        <StatTile :value="d.totalHours" unit="h" :label='t("timeListening")' />
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
      <div class="mu-panel">
        <CardHeader :title='selected ? fmtDay(selected) : t(list === "songs" ? "topSongs" : "topArtists")'>
          <template #note>
            <button v-if="selected" class="mu-back" @click="clear">{{ t(list === "songs" ? "backToTopSongs" : "backToTopArtists") }}</button>
          </template>
        </CardHeader>

        <!-- a day's rows -->
        <template v-if="selected">
          <p v-if="dayLoading" class="mu-dim">{{ t("loading") }}</p>
          <p v-else-if="dayError" class="mu-dim">{{ t("loadDayFailed") }}</p>
          <p v-else-if="!dayTrackCount" class="mu-dim mu-day-empty">{{ t("emptyDayMusic") }}</p>
          <template v-else>
            <p class="mu-day-sum">
              {{ dayMinutes }} min · {{ dayTrackCount }} track{{ dayTrackCount > 1 ? "s" : "" }} ·
              {{ dayArtistCount }} artist{{ dayArtistCount > 1 ? "s" : "" }}
            </p>
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
              {{ row.minutes }}<small> min · {{ row.plays }}×</small>
            </RankedRow>
            <ListFooter
              :more-count="dayMore"
              :expanded="dayExpanded"
              :overflow="dayAtCap ? dayOver : 0"
              @toggle="dayExpanded = !dayExpanded"
            />
          </template>
        </template>

        <!-- a top list -->
        <template v-else>
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
            {{ r.minutes }}<small> min · {{ r.plays }}×</small>
          </RankedRow>
          <ListFooter
            :more-count="mainMore"
            :expanded="mainOpen"
            :overflow="mainAtCap ? mainOver : 0"
            @toggle="mainOpen = !mainOpen"
          />
        </template>
      </div>
    </ModuleCard>
  </ModuleSection>
</template>

<style scoped>
/* Music's own bits only. The shell, card, card header, and list footer are the
   shared primitives (ModuleSection / ModuleCard / CardHeader / ListFooter). What
   stays here: the empty state, the three-up stat/tab grid, the day-drill back
   button, and the day-drill status/summary lines. */
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
.mu-back {
  font: inherit;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0;
}
.mu-back:hover {
  color: var(--ink);
}
.mu-dim {
  color: var(--muted);
  font-size: var(--fs-meta);
  padding: var(--sp-8) 0;
}
.mu-day-empty {
  text-align: center;
  padding: var(--sp-16) 0;
}
.mu-day-sum {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  margin-bottom: var(--sp-4);
}
</style>
