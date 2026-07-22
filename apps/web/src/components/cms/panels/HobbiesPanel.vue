<script setup lang="ts">
import ListItemActions from "../ListItemActions.vue";
import LocalizedField from "../LocalizedField.vue";
import { TONES } from "@lg/core";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
// `hobbiesList` is the client's half of the server's registerCrud — same four
// operations, typed, named for what they do rather than for the button.
const {
	hobbiesList,
} = useCmsContext();
</script>

<template>
  <section class="pane">
    <div v-for="(h, i) in hobbiesList.items.value" :key="h.id" class="card">
      <div class="grid2">
        <label>ID<input v-model="h.id" /></label>
        <label>Icon<input v-model="h.icon" placeholder="game / plant / chip / server" /></label>
        <label>Title<LocalizedField :field="h.title" /></label>
        <!-- TONES, not four hard-coded options: this dropdown was the fifth copy
             of that list, and the one that decides what you can pick. -->
        <label>Tone
          <select v-model="h.tone">
            <option v-for="t in TONES" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
      </div>
      <label>Blurb<LocalizedField :field="h.blurb" /></label>
      <div class="actions">
        <ListItemActions :list="hobbiesList" :index="i" :item="h" />
      </div>
    </div>
    <button class="btn ghost" @click="hobbiesList.add()">+ Add hobby</button>
  </section>
</template>
