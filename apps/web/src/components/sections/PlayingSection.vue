<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { useT } from "~/composables/useT";
import { presenceMediaUrl } from "../../lib/api";
import { trackClick } from "../../lib/track";
import ModuleSection from "../ui/ModuleSection.vue";
import SmartLink from "../ui/SmartLink.vue";
import Freshness from "../ui/Freshness.vue";
import ArtTile from "../ui/ArtTile.vue";
import RankedRow from "../ui/RankedRow.vue";
import Duration from "../ui/Duration.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "playing" }>;
}>();

const { t } = useT();
const cover = (url: string | undefined, game: string) => presenceMediaUrl({ url, game });
const artSrc = (url?: string) => (url ? presenceMediaUrl({ url }) : undefined);
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <template #note>
      <span v-if="module.data.note" class="note">{{ module.data.note }}</span>
      <Freshness :freshness="module.data.freshness" />
      <SmartLink class="more" :href="module.data.moreHref" @click="() => trackClick('playing-more')">{{ t("allGamesMusic") }}</SmartLink>
    </template>
    <div v-if="module.data.games.length" class="pl-group">
      <h3 class="pl-title">{{ t("topGames") }}</h3>
      <ol class="pl-wall">
        <ArtTile
          v-for="(g, i) in module.data.games"
          :key="g.name"
          :rank="i + 1"
          :name="g.name"
          :art="cover(g.coverUrl, g.name)"
          :highlight="i === 0"
        >
          <Duration :minutes="g.minutes" /><small v-if="!g.exact"> +</small>
        </ArtTile>
      </ol>
    </div>
    <div v-if="module.data.songs.length" class="pl-group pl-songs">
      <h3 class="pl-title">{{ t("topSongs") }}</h3>
      <RankedRow
        v-for="(s, i) in module.data.songs"
        :key="`${s.name}-${i}`"
        :rank="i + 1"
        :name="s.name"
        :subtitle="s.by"
        :art="artSrc(s.artUrl)"
        :highlight="i === 0"
        variant="type"
      >
        {{ s.plays }}×
      </RankedRow>
    </div>
  </ModuleSection>
</template>

<style scoped>
.note {
  font-family: var(--f-b);
  font-size: var(--fs-meta);
  color: var(--muted);
}
.pl-group + .pl-group {
  margin-top: var(--space-7);
}
.pl-title {
  margin: 0 0 var(--space-3);
  font-family: var(--f-b);
  font-weight: 600;
  font-size: var(--fs-h3);
  line-height: 1.15;
  color: var(--ink-strong);
}
.pl-wall {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  margin: 0;
  padding: 0;
}
@container (min-width: 720px) {
  .pl-wall {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.pl-songs {
  max-width: 48rem;
}
.pl-songs :deep(.rr) {
  border-top: 0;
}
</style>
