<script setup lang="ts">
import EntityCards from "../EntityCards.vue";
import LocalizedField from "../LocalizedField.vue";
import { TONES } from "@lg/core";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel: its fields, and nothing else. The card frame, the reorder /
// delete / save row and the add button are EntityCards; state and handlers come
// from the shared CMS context.
const { hobbiesList } = useCmsContext();
</script>

<template>
  <section class="pane">
    <EntityCards :list="hobbiesList" add-label="+ Add hobby">
      <template #default="{ item: h }">
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
      </template>
    </EntityCards>
  </section>
</template>
