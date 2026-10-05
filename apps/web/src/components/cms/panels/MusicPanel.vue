<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";
import ListSettings from "../ListSettings.vue";

const { MUSIC_LIST_BOUNDS, musicInitialCount, musicMaxCount, musicDefaultRange, saveMusic } =
  useCmsContext();
</script>

<template>
  <section class="pane">
    <div class="card">
      <h3>Listening list</h3>
      <p class="help">The top-songs and top-artists lists. The totals above them always stay the true counts.</p>
      <ListSettings
        v-model:initial-count="musicInitialCount"
        v-model:max-count="musicMaxCount"
        v-model:default-range="musicDefaultRange"
        rows="songs and artists"
        :bounds="MUSIC_LIST_BOUNDS"
        cap-detail="Enforced on the server as the query limit, so rows past it never reach the page. The 'tracks played' and 'different artists' figures are separate counts and are not affected."
        save-label="Save listening"
        @save="saveMusic"
      />
    </div>
  </section>
</template>
