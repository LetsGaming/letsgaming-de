<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";
import ListSettings from "../ListSettings.vue";

const {
  PLAYTIME_LIST_BOUNDS,
  playtimeInitialCount,
  playtimeMaxCount,
  playtimeDefaultRange,
  savePlaytime,
} = useCmsContext();
</script>

<template>
  <section class="pane">
    <div class="card">
      <h3>Played list</h3>
      <p class="help">The top-games list and its per-day breakdown. Separate from Listening, so the two can differ.</p>
      <ListSettings
        v-model:initial-count="playtimeInitialCount"
        v-model:max-count="playtimeMaxCount"
        v-model:default-range="playtimeDefaultRange"
        rows="games"
        :bounds="PLAYTIME_LIST_BOUNDS"
        cap-detail="Applied in the view to the top-games list and to each day's breakdown. The 'games played' headline is a separate count and is not affected."
        save-label="Save played"
        @save="savePlaytime"
      />
    </div>
  </section>
</template>
