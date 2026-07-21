<script setup lang="ts">
/**
 * The Wrapped module — a periodic retrospective of a closed cycle, both listening
 * and playing, in the spirit of Spotify Wrapped. Unlike Listening/Playtime it isn't
 * live and has no drill-in: the server sends a fixed set of top lists + totals for
 * the period the schedule just closed, and only while a window is open (so a
 * rendered Wrapped is, by construction, in season).
 */
import { computed } from "vue";
import type { ResolvedModule } from "@lg/core";
import { presenceMediaUrl } from "../../lib/api";
import RankedRow from "../ui/RankedRow.vue";
import StatTile from "../ui/StatTile.vue";

const props = defineProps<{ module: Extract<ResolvedModule, { kind: "wrapped" }> }>();
const d = computed(() => props.module.data);

const artSrc = (url?: string) => (url ? presenceMediaUrl({ url }) : undefined);

// "Oct – Dec 2025": the months the period spans. `periodEnd` is the exclusive cycle
// boundary, so the last day covered is the day before it.
const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const periodLabel = computed(() => {
  const start = monthYear(d.value.periodStart);
  const lastDay = new Date(new Date(d.value.periodEnd).getTime() - 86_400_000).toISOString();
  const end = monthYear(lastDay);
  return start === end ? start : `${start} – ${end}`;
});

const fmtHrs = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
};

const topArtist = computed(() => d.value.music.topArtists[0]?.name);
const topGame = computed(() => d.value.games.top[0]?.name);
const hasMusic = computed(() => d.value.music.topSongs.length > 0 || d.value.music.topArtists.length > 0);
const hasGames = computed(() => d.value.games.top.length > 0);
const hasData = computed(() => hasMusic.value || hasGames.value);
</script>

<template>
  <section :id="module.id" class="wr">
    <header class="wr-head">
      <div class="wr-titles">
        <h2 class="wr-title">{{ d.heading || "Wrapped" }}</h2>
        <span v-if="d.note" class="wr-note">{{ d.note }}</span>
      </div>
      <span class="wr-period">{{ periodLabel }}</span>
    </header>

    <p v-if="hasData && (topArtist || topGame)" class="wr-lead">
      <template v-if="topArtist">On repeat: <b>{{ topArtist }}</b></template>
      <template v-if="topArtist && topGame"> · </template>
      <template v-if="topGame">Most played: <b>{{ topGame }}</b></template>
    </p>

    <p v-if="!hasData" class="wr-empty">Not enough listening or playing this period to wrap up.</p>

    <div v-else class="wr-grid">
      <!-- ── Listening ─────────────────────────────────────────────── -->
      <div class="wr-card">
        <h3 class="wr-h">Listening</h3>
        <div v-if="hasMusic" class="wr-stats">
          <StatTile :value="d.music.totalHours" unit="h" label="time listening" />
          <StatTile :value="d.music.trackCount" label="tracks" />
          <StatTile :value="d.music.artistCount" label="artists" />
        </div>
        <div v-if="hasMusic" class="wr-lists">
          <div v-if="d.music.topSongs.length" class="wr-list">
            <h4 class="wr-lh">Top songs</h4>
            <RankedRow
              v-for="(s, i) in d.music.topSongs"
              :key="`song-${i}`"
              :rank="i + 1"
              :name="s.name"
              :subtitle="s.by"
              :art="artSrc(s.artUrl)"
              :highlight="i === 0"
              fallback="♪"
            >
              {{ s.minutes }}<small> min</small>
            </RankedRow>
          </div>
          <div v-if="d.music.topArtists.length" class="wr-list">
            <h4 class="wr-lh">Top artists</h4>
            <RankedRow
              v-for="(a, i) in d.music.topArtists"
              :key="`artist-${i}`"
              :rank="i + 1"
              :name="a.name"
              :art="artSrc(a.artUrl)"
              :highlight="i === 0"
              fallback="♪"
            >
              {{ a.minutes }}<small> min</small>
            </RankedRow>
          </div>
        </div>
        <p v-else class="wr-none">No listening recorded this period.</p>
      </div>

      <!-- ── Playing ───────────────────────────────────────────────── -->
      <div class="wr-card">
        <h3 class="wr-h">Playing</h3>
        <div v-if="hasGames" class="wr-stats">
          <StatTile :value="d.games.totalHours" unit="h" label="time playing" />
          <StatTile :value="d.games.gameCount" label="games" />
        </div>
        <div v-if="hasGames" class="wr-list">
          <h4 class="wr-lh">Top games</h4>
          <RankedRow
            v-for="(g, i) in d.games.top"
            :key="`game-${i}`"
            :rank="i + 1"
            :name="g.name"
            :subtitle="g.genre"
            :art="artSrc(g.coverUrl)"
            :highlight="i === 0"
            fallback="🎮"
          >
            {{ fmtHrs(g.minutes) }}<small v-if="!g.exact"> +</small>
          </RankedRow>
        </div>
        <p v-else class="wr-none">No playtime recorded this period.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wr {
  container-type: inline-size;
}
.wr-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-12);
  flex-wrap: wrap;
}
.wr-titles {
  display: flex;
  align-items: baseline;
  gap: var(--sp-10);
  flex-wrap: wrap;
}
.wr-title {
  font-family: var(--f-d);
  font-size: var(--fs-h2);
  color: var(--ink-strong);
}
.wr-note {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
/* The period pill carries the module's one flash of accent — this is the "when". */
.wr-period {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--live-ink);
  border: 1px solid color-mix(in srgb, var(--live-ink) 40%, transparent);
  border-radius: 999px;
  padding: 2px var(--sp-10);
  white-space: nowrap;
}
.wr-lead {
  margin-top: var(--sp-10);
  font-size: var(--fs-body);
  color: var(--ink);
}
.wr-lead b {
  color: var(--ink-strong);
}
.wr-empty {
  margin-top: var(--sp-14);
  font-size: var(--fs-body);
  color: var(--muted);
}

.wr-grid {
  margin-top: var(--sp-16);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-14);
}
@container (max-width: 640px) {
  .wr-grid {
    grid-template-columns: 1fr;
  }
}
.wr-card {
  background: var(--card);
  border: 1px solid var(--line-1);
  border-radius: var(--r-card);
  padding: var(--sp-16);
}
.wr-h {
  font-family: var(--f-d);
  font-size: var(--fs-h3);
  color: var(--ink-strong);
  margin-bottom: var(--sp-12);
}
.wr-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-8);
  margin-bottom: var(--sp-16);
}
.wr-card:nth-child(2) .wr-stats {
  grid-template-columns: repeat(2, 1fr);
}
.wr-lists {
  display: grid;
  gap: var(--sp-16);
}
.wr-lh {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: var(--sp-8);
}
.wr-none {
  font-size: var(--fs-meta);
  color: var(--muted);
}
</style>
