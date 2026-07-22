<script setup lang="ts">
/**
 * The Wrapped retrospective.
 *
 * Deliberately has no "should I show?" logic: the schedule is enforced in the
 * resolver, which omits the module entirely outside a window. If this component
 * renders at all, it's because the server decided it should — the same contract a
 * draft area has.
 */
import type { ResolvedModule } from "@lg/core";
import { presenceMediaUrl } from "~/lib/api";
import { useT } from "~/composables/useT";
import ModuleSection from "../ui/ModuleSection.vue";
import ModuleCard from "../ui/ModuleCard.vue";
import CardHeader from "../ui/CardHeader.vue";
import RankedRow from "../ui/RankedRow.vue";
import StatTile from "../ui/StatTile.vue";
import Duration from "../ui/Duration.vue";

const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "wrapped" }>;
}>();

const { t, locale } = useT();
const d = computed(() => props.module.data);

/**
 * Artwork goes through our own media proxy, exactly as Listening and Time played
 * do — never straight to Spotify's or RAWG's CDN, which would hand a visitor's IP
 * to a third party. For games the name rides along too, so the server can fall back
 * to a labelled tile (and serve the downscaled cover) when there's no art.
 */
const cover = (url?: string) => (url ? presenceMediaUrl({ url }) : undefined);
const gameCover = (url: string | undefined, game: string) => presenceMediaUrl({ url, game });

/** "Oct 2025 — Jan 2026", formatted for the rendered locale. */
const periodLabel = computed(() => {
  const fmt = new Intl.DateTimeFormat(locale.value, { month: "short", year: "numeric", timeZone: "UTC" });
  return `${fmt.format(new Date(d.value.periodStart))} — ${fmt.format(new Date(d.value.periodEnd))}`;
});
</script>

<template>
  <ModuleSection :id="module.id" :heading="d.heading" :note="d.note ?? periodLabel">
    <ModuleCard>
      <CardHeader as="span" tone="live" :title="d.heading" :note="periodLabel" />

      <div class="wr-stats">
        <StatTile :label="t('timeListening')">
          <template #value><Duration :minutes="d.totalMinutesListened" /></template>
        </StatTile>
        <StatTile :label="t('timePlayed')">
          <template #value><Duration :minutes="d.totalMinutesPlayed" /></template>
        </StatTile>
      </div>

      <!--
        Two columns, in DOM order: songs beside artists, then games beside genres.
        The genre roll-up exists partly to fill that fourth cell — a lone full-width
        games list under two half-width ones reads as a layout accident.
      -->
      <div class="wr-grid">
        <div v-if="d.topSongs.length" class="wr-list">
          <CardHeader :title="t('topSongs')" />
          <RankedRow
            v-for="(r, i) in d.topSongs"
            :key="`s-${i}`"
            :rank="i + 1"
            :name="r.name"
            :subtitle="r.detail"
            :art="cover(r.artUrl)"
            :highlight="i === 0"
            fallback="♪"
          ><Duration :minutes="r.minutes" /><small> · {{ r.plays }}×</small></RankedRow>
        </div>

        <div v-if="d.topArtists.length" class="wr-list">
          <CardHeader :title="t('topArtists')" />
          <RankedRow
            v-for="(r, i) in d.topArtists"
            :key="`a-${i}`"
            :rank="i + 1"
            :name="r.name"
            :art="cover(r.artUrl)"
            :highlight="i === 0"
            fallback="♪"
          ><Duration :minutes="r.minutes" /></RankedRow>
        </div>

        <div v-if="d.topGames.length" class="wr-list">
          <CardHeader :title="t('topGames')" />
          <RankedRow
            v-for="(r, i) in d.topGames"
            :key="`g-${i}`"
            :rank="i + 1"
            :name="r.name"
            :subtitle="r.detail"
            :art="gameCover(r.artUrl, r.name)"
            :highlight="i === 0"
            fallback="🎮"
          ><Duration :minutes="r.minutes" /></RankedRow>
        </div>

        <div v-if="d.topGenres.length" class="wr-list">
          <CardHeader :title="t('topGenres')" />
          <RankedRow
            v-for="(r, i) in d.topGenres"
            :key="`n-${i}`"
            :rank="i + 1"
            :name="r.name"
            :highlight="i === 0"
            fallback="◆"
          ><Duration :minutes="r.minutes" /></RankedRow>
        </div>
      </div>

      <p v-if="!d.topSongs.length && !d.topGames.length" class="sub">{{ t("emptyWrapped") }}</p>
    </ModuleCard>
  </ModuleSection>
</template>

<style scoped>
.wr-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-10);
  margin-bottom: var(--sp-16);
}
/* Songs | artists over games | genres. The column gap is wider than the row gap so
   the two lists in a row read as separate columns rather than one wrapped list. */
.wr-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-24) var(--sp-24);
}
/* ModuleSection is the query container, so this responds to the card's own width
   rather than the viewport — the same card in a narrow CMS canvas stacks too. */
@container (max-width: 640px) {
  .wr-grid {
    grid-template-columns: 1fr;
    gap: var(--sp-18);
  }
}
</style>
