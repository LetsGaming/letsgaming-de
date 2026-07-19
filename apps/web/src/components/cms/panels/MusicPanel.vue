<script setup lang="ts">
import { computed } from "vue";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. State and the save handler come from the shared CMS context.
const { MUSIC_LIST_BOUNDS, musicInitialCount, musicMaxCount, saveMusic } = useCmsContext();

// A hint, not a block: the server sanitizer pins "always show" down to the max on
// save, so an over-order pair is harmless — but say so rather than silently fix it.
const overMax = computed(() => musicInitialCount.value > musicMaxCount.value);
</script>

<template>
  <section class="pane">
    <div class="card">
      <h3>Listening list <span class="muted">(Life → “Listening”)</span></h3>
      <p class="muted">
        How many rows the top-songs and top-artists lists show. The cap is enforced on the server —
        rows past it never reach the page, so nothing is fetched only to be hidden. The “tracks
        played” and “different artists” figures are separate counts and aren't touched by this: they
        stay the true totals even when the list is trimmed to a top N.
      </p>

      <h4>Always show</h4>
      <p class="muted">Rows visible before the “show more” toggle.</p>
      <input
        v-model.number="musicInitialCount"
        type="number"
        class="num"
        :min="MUSIC_LIST_BOUNDS.min"
        :max="MUSIC_LIST_BOUNDS.max"
      />

      <h4>Show at most</h4>
      <p class="muted">The most rows the list ever shows — applied as the query limit.</p>
      <input
        v-model.number="musicMaxCount"
        type="number"
        class="num"
        :min="MUSIC_LIST_BOUNDS.min"
        :max="MUSIC_LIST_BOUNDS.max"
      />
      <p v-if="overMax" class="muted note">
        “Always show” is above the max — it'll be capped to the max when you save.
      </p>

      <div class="actions"><button class="btn" @click="saveMusic">Save listening</button></div>
    </div>
  </section>
</template>

<style scoped>
.pane h4 {
  margin: var(--sp-16) 0 var(--sp-4);
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
}
.pane h4:first-of-type {
  margin-top: var(--sp-8);
}
.note {
  font-size: var(--fs-micro);
  margin-top: var(--sp-6);
}
.num {
  font: inherit;
  font-size: 13px;
  background: var(--card-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  padding: 6px var(--sp-10);
  width: 90px;
}
</style>
