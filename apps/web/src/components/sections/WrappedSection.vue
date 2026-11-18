<script setup lang="ts">
/**
 * The Wrapped retrospective, set as a poster: oversized figures, art-led songs and
 * games, then artists and genres in plain columns. No card chrome.
 *
 * Deliberately has no "should I show?" logic: the schedule is enforced in the
 * resolver, which omits the module entirely outside a window. If this component
 * renders at all, it's because the server decided it should, the same contract a
 * draft area has.
 */
import type { ResolvedModule } from "@lg/core";
import { presenceMediaUrl } from "~/lib/api";
import { useT } from "~/composables/useT";
import ModuleSection from "../ui/ModuleSection.vue";
import ArtTile from "../ui/ArtTile.vue";
import StatTile from "../ui/StatTile.vue";
import Duration from "../ui/Duration.vue";

const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "wrapped" }>;
}>();

const { t, locale } = useT();
const d = computed(() => props.module.data);

/**
 * Artwork goes through our own media proxy, exactly as Listening and Time played
 * do: never straight to Spotify's or RAWG's CDN, which would hand a visitor's IP
 * to a third party. For games the name rides along too, so the server can fall back
 * to a labelled tile (and serve the downscaled cover) when there's no art.
 */
const cover = (url?: string) => (url ? presenceMediaUrl({ url }) : undefined);
const gameCover = (url: string | undefined, game: string) => presenceMediaUrl({ url, game });

/** "Oct 2025 to Jan 2026", formatted for the rendered locale. */
const periodLabel = computed(() => {
  const fmt = new Intl.DateTimeFormat(locale.value, { month: "short", year: "numeric", timeZone: "UTC" });
  return t("periodRange", {
    from: fmt.format(new Date(d.value.periodStart)),
    to: fmt.format(new Date(d.value.periodEnd)),
  });
});
</script>

<template>
  <ModuleSection :id="module.id" :heading="d.heading" :note="d.note" variant="ruled" class="wr">
    <div class="wr-poster">
    <div class="wr-side">
    <p class="wr-period">{{ periodLabel }}</p>

    <div class="wr-figs">
      <StatTile size="display" :label="t('timeListening')">
        <template #value><Duration :minutes="d.totalMinutesListened" /></template>
      </StatTile>
      <StatTile size="display" :label="t('timePlayed')">
        <template #value><Duration :minutes="d.totalMinutesPlayed" /></template>
      </StatTile>
    </div>

    <div class="wr-cols">
      <div v-if="d.topArtists.length" class="wr-block">
        <h3 class="wr-h">{{ t("topArtists") }}</h3>
        <ol class="wr-list">
          <li v-for="(r, i) in d.topArtists" :key="`a-${i}`" :class="{ 'is-1': i === 0 }">
            <span class="wr-n">{{ i + 1 }}</span>
            <span class="wr-name">{{ r.name }}</span>
            <span class="wr-val"><Duration :minutes="r.minutes" /></span>
          </li>
        </ol>
      </div>

      <div v-if="d.topGenres.length" class="wr-block">
        <h3 class="wr-h">{{ t("topGenres") }}</h3>
        <ol class="wr-list">
          <li v-for="(r, i) in d.topGenres" :key="`n-${i}`" :class="{ 'is-1': i === 0 }">
            <span class="wr-n">{{ i + 1 }}</span>
            <span class="wr-name">{{ r.name }}</span>
            <span class="wr-val"><Duration :minutes="r.minutes" /></span>
          </li>
        </ol>
      </div>
    </div>
    </div>

    <div class="wr-art">
      <div v-if="d.topSongs.length" class="wr-block">
        <h3 class="wr-h">{{ t("topSongs") }}</h3>
        <ol class="wr-tiles">
          <ArtTile
            v-for="(r, i) in d.topSongs"
            :key="`s-${i}`"
            ratio="square"
            :rank="i + 1"
            :name="r.name"
            :subtitle="r.detail"
            :art="cover(r.artUrl)"
            :highlight="i === 0"
          ><Duration :minutes="r.minutes" /><small>, {{ r.plays }}×</small></ArtTile>
        </ol>
      </div>

      <div v-if="d.topGames.length" class="wr-block">
        <h3 class="wr-h">{{ t("topGames") }}</h3>
        <ol class="wr-tiles">
          <ArtTile
            v-for="(r, i) in d.topGames"
            :key="`g-${i}`"
            ratio="square"
            :rank="i + 1"
            :name="r.name"
            :subtitle="r.detail"
            :art="gameCover(r.artUrl, r.name)"
            :highlight="i === 0"
          ><Duration :minutes="r.minutes" /></ArtTile>
        </ol>
      </div>
    </div>

    </div>

    <p v-if="!d.topSongs.length && !d.topGames.length" class="sub">{{ t("emptyWrapped") }}</p>
  </ModuleSection>
</template>

<style scoped>
.wr {
  padding-top: var(--space-5);
}
.wr-period {
  font-family: var(--f-d);
  font-size: var(--fs-h3);
  color: var(--ink);
}
.wr-poster {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-6);
}
.wr-side,
.wr-art {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0;
}
.wr-figs {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}
.wr-figs :deep(.st) {
  border-top: 0;
  padding-top: 0;
}
.wr-figs :deep(.st-n) {
  line-height: 1.05;
}
.wr-cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);
}
@container (min-width: 720px) {
  .wr-poster {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: var(--space-7);
  }
}
.wr-h {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h3);
  color: var(--ink-strong);
  margin-bottom: var(--space-3);
}
.wr-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
}
.wr-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.wr-list li {
  display: grid;
  grid-template-columns: var(--space-5) minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: baseline;
  padding: var(--space-1) 0;
}
.wr-n {
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  text-align: right;
}
.wr-name {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h3);
  line-height: 1.2;
  color: var(--ink-strong);
  overflow-wrap: anywhere;
}
.wr-val {
  font-size: var(--fs-meta);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  white-space: nowrap;
}
.is-1 .wr-n {
  font-weight: 700;
  color: var(--ink-strong);
}
@container (min-width: 720px) {
  .wr-tiles {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
</style>
