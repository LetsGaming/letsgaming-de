<script setup lang="ts">
/**
 * The music module — a fortnight of Spotify listening, from `music_plays`.
 *
 * Sibling to `PlaytimeSection`, and built to mirror it: both are the accumulated
 * past, not the live card. The strip + drill wiring is the shared `useLedgerStrip`,
 * the row is `RankedRow`, the stat tiles `StatTile`, the timeline `HeatStrip`.
 *
 * What's Music's own: two lists, not one. The stats double as tabs — "tracks
 * played" reveals the songs, "different artists" the artists, one content region
 * taking turns; "time listening" is inert (no list behind a duration). The day
 * drill respects that choice via `dayRowsFor`: click a day on "different artists"
 * and you get *that day's artists*, not its raw tracks. Genre and podcast-vs-music
 * are absent by construction — Discord's Spotify presence exposes neither.
 */
import { computed, ref } from "vue";
import { splitArtists, type MusicDayResponse, type MusicRankView, type ResolvedModule } from "@lg/core";
import { presenceMediaUrl } from "../../lib/api";
import { fmtDay } from "../../lib/calendar";
import { fetchMusicDay } from "../../lib/music-api";
import { dayRowsFor, type DayRow, type ListKind } from "../../lib/music-day";
import { useLiveModule } from "../../composables/useLiveModule";
import { useLedgerStrip } from "../../composables/useLedgerStrip";
import RankedRow from "../ui/RankedRow.vue";
import StatTile from "../ui/StatTile.vue";
import HeatStrip from "../ui/HeatStrip.vue";

const props = defineProps<{ module: Extract<ResolvedModule, { kind: "music" }> }>();
// Polls `/api/module/:id` so the module refreshes in place, starting from SSR data.
const { data: liveData } = useLiveModule(props.module.id, "music", props.module.data);
const d = computed(() => liveData.value);

// How many rows show before "show more" — CMS-configured. The lists are already
// capped server-side, so expanding never reveals more than the backend sent.
const TOP_SHOWN = computed(() => d.value.initialCount);

// The clickable fortnight timeline + day drill-in — shared with Playtime.
const { selected, dayData: dayTracks, dayLoading, dayError, dayExpanded, strip, cells, selectedIndex, onSelect, clear } =
  useLedgerStrip<MusicDayResponse["tracks"]>({
    ledger: () => d.value.ledger,
    fetchDay: fetchMusicDay,
    emptyDay: [],
    title: (day, min) => `${fmtDay(day)} · ${min} min`,
  });
const stripStart = computed(() => (strip.value[0] ? fmtDay(strip.value[0].day) : ""));

// Which list backs the panel (songs or artists), and whether it's expanded.
const list = ref<ListKind>("songs");
const expanded = ref(false);
const activeRows = computed<MusicRankView[]>(() => (list.value === "songs" ? d.value.topSongs : d.value.topArtists));
const shownRows = computed(() => (expanded.value ? activeRows.value : activeRows.value.slice(0, TOP_SHOWN.value)));
const hiddenCount = computed(() => Math.max(0, activeRows.value.length - TOP_SHOWN.value));

function showList(which: ListKind) {
  list.value = which;
  expanded.value = false;
  clear();
}

// The day panel rows, following the active tab (delegated to a tested pure fn so
// "artists → that day's artists, not its tracks" can't regress).
const dayRowsAll = computed<DayRow[]>(() => dayRowsFor(dayTracks.value ?? [], list.value));
const shownDayRows = computed(() => (dayExpanded.value ? dayRowsAll.value : dayRowsAll.value.slice(0, TOP_SHOWN.value)));
const dayHidden = computed(() => Math.max(0, dayRowsAll.value.length - TOP_SHOWN.value));

// Day summary counts (tracks + split artists), independent of the active tab.
const dayTrackCount = computed(() => dayTracks.value?.length ?? 0);
const dayMinutes = computed(() => (dayTracks.value ?? []).reduce((s, t) => s + t.minutes, 0));
const dayArtistCount = computed(
  () => new Set((dayTracks.value ?? []).flatMap((t) => splitArtists(t.artist).map((a) => a.toLowerCase()))).size,
);

const artSrc = (url?: string) => (url ? presenceMediaUrl({ url }) : undefined);
const hasData = computed(() => d.value.ledger.length > 0 || d.value.topSongs.length > 0);
</script>

<template>
  <section :id="module.id" class="mu">
    <header class="mu-head">
      <h2 class="mu-title">{{ d.heading }}</h2>
      <span v-if="d.note" class="mu-note">{{ d.note }}</span>
    </header>

    <!-- Empty state: nothing recorded until the sampler catches Spotify playing. -->
    <p v-if="!hasData" class="mu-empty">
      Nothing recorded yet. Tracks show up here after the presence sampler catches
      Spotify playing — give it a day.
    </p>

    <div v-else class="mu-card">
      <div class="mu-card-h">
        <span class="mu-t">Listening</span>
        <span class="mu-scope">{{ selected ? fmtDay(selected) : "last 14 days" }}</span>
      </div>

      <!-- Stats double as tabs. "time listening" is inert (no list behind it). -->
      <div class="mu-stats">
        <StatTile :value="d.totalHours" unit="h" label="time listening" />
        <StatTile
          :value="d.trackCount"
          label="tracks played"
          interactive
          :active="list === 'songs'"
          @select="showList('songs')"
        />
        <StatTile
          :value="d.artistCount"
          label="different artists"
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
        <div class="mu-panel-h">
          <h3>{{ selected ? fmtDay(selected) : list === "songs" ? "Top songs" : "Top artists" }}</h3>
          <button v-if="selected" class="mu-back" @click="clear">← back to top {{ list }}</button>
        </div>

        <!-- a day's rows -->
        <template v-if="selected">
          <p v-if="dayLoading" class="mu-dim">Loading…</p>
          <p v-else-if="dayError" class="mu-dim">Couldn't load that day.</p>
          <p v-else-if="!dayTrackCount" class="mu-dim mu-day-empty">Nothing played this day.</p>
          <template v-else>
            <p class="mu-day-sum">
              {{ dayMinutes }} min · {{ dayTrackCount }} track{{ dayTrackCount > 1 ? "s" : "" }} ·
              {{ dayArtistCount }} artist{{ dayArtistCount > 1 ? "s" : "" }}
            </p>
            <RankedRow
              v-for="(row, i) in shownDayRows"
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
            <button v-if="dayHidden > 0" class="mu-more" @click="dayExpanded = !dayExpanded">
              {{ dayExpanded ? "show less" : `show ${dayHidden} more` }}
            </button>
          </template>
        </template>

        <!-- a top list -->
        <template v-else>
          <RankedRow
            v-for="(r, i) in shownRows"
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
          <button v-if="hiddenCount > 0" class="mu-more" @click="expanded = !expanded">
            {{ expanded ? "show less" : `show ${hiddenCount} more` }}
          </button>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mu {
  container-type: inline-size;
}
.mu-head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-10);
  margin-bottom: var(--sp-14);
}
.mu-title {
  font-family: var(--f-d);
  font-size: var(--fs-h2);
  color: var(--ink-strong);
}
.mu-note {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
.mu-empty {
  color: var(--muted);
  font-size: var(--fs-body);
}
.mu-card {
  background: var(--surf-1);
  border: 1px solid var(--line-1);
  border-radius: var(--r-card);
  padding: var(--sp-18);
}
.mu-card-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-12);
  margin-bottom: var(--sp-14);
}
.mu-t {
  font-family: var(--f-d);
  font-size: var(--fs-h3);
  color: var(--ink-strong);
}
.mu-scope {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--live-ink);
}
.mu-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-10);
  margin-bottom: var(--sp-16);
}
.mu-panel-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-10);
  margin-bottom: var(--sp-8);
}
.mu-panel-h h3 {
  font-family: var(--f-d);
  font-size: var(--fs-h3);
  color: var(--ink-strong);
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
.mu-more {
  font: inherit;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--live-ink);
  background: none;
  border: 0;
  cursor: pointer;
  padding: var(--sp-8) 0 0;
}
.mu-more:hover {
  text-decoration: underline;
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
