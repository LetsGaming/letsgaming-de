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
import { useT } from "~/composables/useT";
import ModuleSection from "../ui/ModuleSection.vue";
import ModuleCard from "../ui/ModuleCard.vue";
import CardHeader from "../ui/CardHeader.vue";
import RankedRow from "../ui/RankedRow.vue";
import StatTile from "../ui/StatTile.vue";

const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "wrapped" }>;
}>();

const { t, locale } = useT();
const d = computed(() => props.module.data);

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
        <StatTile :value="Math.round(d.totalMinutesListened / 60)" unit="h" :label="t('timeListening')" />
        <StatTile :value="Math.round(d.totalMinutesPlayed / 60)" unit="h" :label="t('timePlayed')" />
      </div>

      <div v-if="d.topSongs.length" class="wr-list">
        <CardHeader :title="t('topSongs')" />
        <RankedRow
          v-for="(r, i) in d.topSongs"
          :key="`s-${i}`"
          :rank="i + 1"
          :name="r.name"
          :subtitle="r.detail"
          :art="r.artUrl"
          :highlight="i === 0"
          fallback="♪"
        >{{ r.minutes }}<small> {{ t("minutesShort") }} · {{ r.plays }}×</small></RankedRow>
      </div>

      <div v-if="d.topArtists.length" class="wr-list">
        <CardHeader :title="t('topArtists')" />
        <RankedRow
          v-for="(r, i) in d.topArtists"
          :key="`a-${i}`"
          :rank="i + 1"
          :name="r.name"
          :art="r.artUrl"
          :highlight="i === 0"
          fallback="♪"
        >{{ r.minutes }}<small> {{ t("minutesShort") }}</small></RankedRow>
      </div>

      <div v-if="d.topGames.length" class="wr-list">
        <CardHeader :title="t('topGames')" />
        <RankedRow
          v-for="(r, i) in d.topGames"
          :key="`g-${i}`"
          :rank="i + 1"
          :name="r.name"
          :subtitle="r.detail"
          :art="r.artUrl"
          :highlight="i === 0"
          fallback="🎮"
        >{{ r.minutes }}<small> {{ t("minutesShort") }}</small></RankedRow>
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
.wr-list + .wr-list {
  margin-top: var(--sp-18);
}
</style>
