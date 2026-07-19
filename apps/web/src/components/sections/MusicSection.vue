<script setup lang="ts">
/**
 * The music module — a fortnight of Spotify listening, from `music_plays`.
 *
 * Sibling to `PlaytimeSection`: both are the *accumulated past*, not the live
 * card. Where playtime asks "when / how much do I play", this asks "what have I
 * been listening to". Same drill-in shape — a per-day heat strip that fetches
 * that day's detail on demand (`/api/music/day`) rather than shipping fourteen
 * days of tracks up front.
 *
 * The three headline stats double as navigation. "tracks played" reveals the
 * songs, "different artists" the artists — one content region taking turns,
 * driven by what you click. "time listening" isn't clickable: there's no list
 * behind a duration. The day drill respects that choice: click a day while on
 * "different artists" and you get *that day's artists*, not its raw tracks.
 *
 * The timeline is the shared calendar HeatGrid rendered as a single row — the
 * same visual language as the contribution and playtime heatmaps, so the site has
 * one way of drawing "activity over days", not a bar strip here and a heatmap
 * there.
 *
 * Genre and podcast-vs-music are absent by construction — Discord's Spotify
 * presence exposes neither. Album art is served through the same
 * `/api/presence/media` proxy the game icons use; a lettered monogram stands in
 * where a play has no stored cover.
 */
import { computed, ref } from "vue";
import { splitArtists, type MusicDayResponse, type MusicRankView, type ResolvedModule } from "@lg/core";
import { presenceMediaUrl } from "../../lib/api";
import { useDayDrill } from "../../composables/useDayDrill";
import { useLiveModule } from "../../composables/useLiveModule";
import { fetchMusicDay } from "../../lib/music-api";
import { contiguousDays, daysBefore } from "../../lib/calendar";
import HeatGrid, { type HeatCell } from "../ui/HeatGrid.vue";

const props = defineProps<{ module: Extract<ResolvedModule, { kind: "music" }> }>();
// Polls `/api/module/:id` so the module refreshes in place (like presence), rather
// than only reflecting what was rendered at page load. Starts from the SSR data.
const { data: liveData } = useLiveModule(props.module.id, "music", props.module.data);
const d = computed(() => liveData.value);

// How many rows show before "show more" — CMS-configured (initialCount). The
// lists themselves are already capped to maxCount server-side, so expanding never
// reveals more than the backend chose to send; this is purely the collapse point.
const TOP_SHOWN = computed(() => d.value.initialCount);

const todayIso = new Date().toISOString().slice(0, 10);
const maxDay = computed(() => Math.max(1, ...d.value.ledger.map((x) => x.minutes)));
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

// ── the day drill-in: fetch that day's tracks on click ────────────────────────
// Shared state machine (same as Playtime); `dayExpanded` is Music's own "show
// more" toggle, so it's local and reset alongside the drill.
const drill = useDayDrill<MusicDayResponse["tracks"]>();
const { selected, data: dayTracks, loading: dayLoading, error: dayError } = drill;
const dayExpanded = ref(false);

// A silent day is a real answer — resolve [] without a fetch; otherwise fetch the
// day's tracks. Collapse "show more" whenever the selection changes.
const selectDay = (iso: string, minutes: number) => {
  dayExpanded.value = false;
  return drill.select(iso, () => (minutes === 0 ? Promise.resolve([]) : fetchMusicDay(iso)));
};
function clearDay() {
  dayExpanded.value = false;
  drill.clear();
}

// ── which list backs the panel, and whether it's expanded past the top 5 ──────
type ListKind = "songs" | "artists";
const list = ref<ListKind>("songs");
const expanded = ref(false);
const activeRows = computed<MusicRankView[]>(() => (list.value === "songs" ? d.value.topSongs : d.value.topArtists));
const shownRows = computed(() => (expanded.value ? activeRows.value : activeRows.value.slice(0, TOP_SHOWN.value)));
const hiddenCount = computed(() => Math.max(0, activeRows.value.length - TOP_SHOWN.value));

function showList(which: ListKind) {
  list.value = which;
  expanded.value = false;
  clearDay();
}

// ── the timeline, as a single-row heat strip ──────────────────────────────────
// One cell per ledger day, coloured by minutes, clickable to drill in. Level
// bucketing is linear (playtime's), local to this caller. The strip is a
// contiguous last-14-days run (empty days zero-filled), so it reads like a
// calendar instead of collapsing days with no listening.
const STRIP_DAYS = 14;
const strip = computed(() => contiguousDays(d.value.ledger, daysBefore(todayIso, STRIP_DAYS - 1), todayIso));
const heatLevel = (min: number) => (min === 0 ? 0 : Math.min(4, Math.ceil((min / maxDay.value) * 4)));
const ledgerCells = computed<HeatCell[]>(() =>
  strip.value.map((row) => ({
    level: heatLevel(row.minutes),
    today: row.day === todayIso,
    title: `${fmtDay(row.day)} · ${row.minutes} min`,
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

// ── the day panel rows, following the active tab ──────────────────────────────
// songs → the day's tracks; artists → the day's artists, aggregated from those
// tracks (splitting collaborations the same way the top-artists list does). This
// is the fix for "click a day on 'different artists' and it showed tracks".
interface DayRow {
  key: string;
  primary: string;
  secondary?: string;
  art?: string;
  minutes: number;
  plays: number;
}
const dayRowsAll = computed<DayRow[]>(() => {
  const tracks = dayTracks.value ?? [];
  if (list.value === "artists") {
    const byArtist = new Map<string, DayRow>();
    for (const t of tracks) {
      for (const name of splitArtists(t.artist)) {
        const key = name.toLowerCase();
        const cur = byArtist.get(key);
        if (cur) {
          cur.minutes += t.minutes;
          cur.plays += t.plays;
          if (!cur.art && t.artUrl) cur.art = t.artUrl;
        } else {
          byArtist.set(key, {
            key,
            primary: name,
            minutes: t.minutes,
            plays: t.plays,
            ...(t.artUrl ? { art: t.artUrl } : {}),
          });
        }
      }
    }
    return [...byArtist.values()].sort((a, b) => b.minutes - a.minutes);
  }
  return tracks.map((t, i) => ({
    key: `${t.song}-${i}`,
    primary: t.song,
    secondary: t.artist,
    ...(t.artUrl ? { art: t.artUrl } : {}),
    minutes: t.minutes,
    plays: t.plays,
  }));
});
const shownDayRows = computed(() => (dayExpanded.value ? dayRowsAll.value : dayRowsAll.value.slice(0, TOP_SHOWN.value)));
const dayHidden = computed(() => Math.max(0, dayRowsAll.value.length - TOP_SHOWN.value));

// Day summary counts (tracks + split artists), independent of the active tab.
const dayTrackCount = computed(() => dayTracks.value?.length ?? 0);
const dayMinutes = computed(() => (dayTracks.value ?? []).reduce((s, t) => s + t.minutes, 0));
const dayArtistCount = computed(
  () => new Set((dayTracks.value ?? []).flatMap((t) => splitArtists(t.artist).map((a) => a.toLowerCase()))).size,
);

// Album art through the proxy; undefined → the template shows a monogram.
const artSrc = (url?: string) => (url ? presenceMediaUrl({ url }) : undefined);
const monogram = (name: string) => name.replace(/[^\p{L}\p{N}]/u, "").charAt(0).toUpperCase() || "♪";

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
        <div class="mu-stat">
          <span class="mu-n">{{ d.totalHours }}<small>h</small></span>
          <span class="mu-l">time listening</span>
        </div>
        <button
          class="mu-stat mu-tab"
          :aria-pressed="!selected && list === 'songs'"
          @click="showList('songs')"
        >
          <span class="mu-n">{{ d.trackCount }}</span>
          <span class="mu-l">tracks played</span>
        </button>
        <button
          class="mu-stat mu-tab"
          :aria-pressed="!selected && list === 'artists'"
          @click="showList('artists')"
        >
          <span class="mu-n">{{ d.artistCount }}</span>
          <span class="mu-l">different artists</span>
        </button>
      </div>

      <!-- Timeline: one heat cell per day over a contiguous fortnight, click to
           drill in. Today wears a faint ring (not the selection accent); the axis
           labels the window ends. A short fixed height keeps 14 cells from
           blowing up to fill the card. -->
      <div v-if="d.ledger.length" class="mu-tl-wrap">
        <div class="mu-tl-lbl"><span>minutes per day</span><span>click a day to drill in</span></div>
        <HeatGrid
          :cells="ledgerCells"
          :rows="1"
          :min-cell="8"
          :cell-height="30"
          legend
          selectable
          :selected-index="selectedLedgerIndex"
          @select="onLedgerSelect"
        />
        <div class="mu-axis">
          <span>{{ strip[0] ? fmtDay(strip[0].day) : "" }}</span>
          <span class="now">today</span>
        </div>
      </div>

      <!-- One content region: a top list, or a day's rows (tracks or artists). -->
      <div class="mu-panel">
        <div class="mu-panel-h">
          <h3>{{ selected ? fmtDay(selected) : list === "songs" ? "Top songs" : "Top artists" }}</h3>
          <button v-if="selected" class="mu-back" @click="clearDay">
            ← back to top {{ list }}
          </button>
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
            <div v-for="(row, i) in shownDayRows" :key="row.key" class="mu-row" :class="{ 'mu-1': i === 0 }">
              <span class="mu-rank">{{ i + 1 }}</span>
              <img v-if="artSrc(row.art)" class="mu-art" :src="artSrc(row.art)" alt="" loading="lazy" />
              <span v-else class="mu-art mu-mono">{{ monogram(row.primary) }}</span>
              <span class="mu-body">
                <span class="mu-name">{{ row.primary }}</span>
                <span v-if="row.secondary" class="mu-by">{{ row.secondary }}</span>
              </span>
              <span class="mu-val">{{ row.minutes }}<small> min · {{ row.plays }}×</small></span>
            </div>
            <button v-if="dayHidden > 0" class="mu-more" @click="dayExpanded = !dayExpanded">
              {{ dayExpanded ? "show less" : `show ${dayHidden} more` }}
            </button>
          </template>
        </template>

        <!-- a top list -->
        <template v-else>
          <div v-for="(r, i) in shownRows" :key="`${r.name}-${i}`" class="mu-row" :class="{ 'mu-1': i === 0 }">
            <span class="mu-rank">{{ i + 1 }}</span>
            <img v-if="artSrc(r.artUrl)" class="mu-art" :src="artSrc(r.artUrl)" alt="" loading="lazy" />
            <span v-else class="mu-art mu-mono">{{ monogram(r.name) }}</span>
            <span class="mu-body">
              <span class="mu-name">{{ r.name }}</span>
              <span v-if="r.by" class="mu-by">{{ r.by }}</span>
            </span>
            <span class="mu-val">{{ r.minutes }}<small> min · {{ r.plays }}×</small></span>
          </div>
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

/* Stats as tabs. Selected = --ink vs --muted, never purple: purple is "now",
   and only the timeline axis owns that here. */
.mu-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-10);
  margin-bottom: var(--sp-16);
}
.mu-stat {
  text-align: left;
  font: inherit;
  background: var(--surf-2);
  border: 1px solid var(--line-1);
  border-radius: var(--r-control);
  padding: var(--sp-12) var(--sp-14);
}
.mu-tab {
  cursor: pointer;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}
.mu-tab:hover {
  background: var(--surf-3);
}
.mu-tab[aria-pressed="true"] {
  border-color: var(--line-2);
  background: var(--surf-3);
}
.mu-n {
  display: block;
  font-family: var(--f-d);
  font-size: 24px;
  color: var(--ink-strong);
  line-height: 1;
}
.mu-n small {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  margin-left: 2px;
}
.mu-l {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
  font-size: var(--fs-meta);
  color: var(--muted);
  margin-top: var(--sp-4);
}
.mu-tab .mu-l::after {
  content: "›";
  color: var(--muted);
  font-size: 14px;
  margin-left: auto;
  transition: transform var(--dur-fast) var(--ease-out);
}
.mu-tab[aria-pressed="true"] .mu-l::after {
  color: var(--live-ink);
  transform: rotate(90deg);
}

/* Timeline — the heat strip is HeatGrid's; this wraps it with its labels. */
.mu-tl-wrap {
  margin-bottom: var(--sp-16);
}
.mu-tl-lbl {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  margin-bottom: var(--sp-8);
}
.mu-axis {
  display: flex;
  justify-content: space-between;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  margin-top: var(--sp-6);
}
.mu-axis .now {
  color: var(--live-ink);
}

/* Content panel. */
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

/* A row: rank | art | title/artist | value. */
.mu-row {
  display: grid;
  grid-template-columns: 18px 34px 1fr auto;
  gap: var(--sp-10);
  align-items: center;
  padding: var(--sp-6) 0;
  border-top: 1px solid var(--line-1);
}
.mu-row:first-child {
  border-top: none;
}
.mu-rank {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--muted);
  text-align: right;
}
.mu-1 .mu-rank {
  color: var(--live-ink);
}
.mu-art {
  width: 34px;
  height: 34px;
  border-radius: var(--r-chip);
  object-fit: cover;
  display: block;
  background: var(--surf-3);
}
.mu-mono {
  display: grid;
  place-items: center;
  font-family: var(--f-d);
  font-size: 15px;
  color: var(--live-ink);
  background: linear-gradient(135deg, var(--surf-3), var(--surf-1));
}
.mu-body {
  min-width: 0;
}
.mu-name {
  display: block;
  font-size: var(--fs-body);
  color: var(--ink-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mu-by {
  display: block;
  font-size: var(--fs-meta);
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mu-val {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--ink);
  white-space: nowrap;
  text-align: right;
}
.mu-val small {
  color: var(--muted);
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

/* Narrow: stats stay one row (short labels), everything else already stacks. */
@container (max-width: 420px) {
  .mu-n {
    font-size: 20px;
  }
  .mu-stat {
    padding: var(--sp-10);
  }
}
</style>
