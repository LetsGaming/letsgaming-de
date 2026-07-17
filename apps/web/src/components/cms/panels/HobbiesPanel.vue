<script setup lang="ts">
import { TONES } from "@lg/core";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
// `hobbiesList` is the client's half of the server's registerCrud — same four
// operations, typed, named for what they do rather than for the button.
const { hobbiesList, locale, lv, setLv, tab } = useCmsContext();
</script>

<template>
  <section class="pane">
    <div v-for="(h, i) in hobbiesList.items.value" :key="h.id" class="card">
      <div class="grid2">
        <label>ID<input v-model="h.id" /></label>
        <label>Icon<input v-model="h.icon" placeholder="game / plant / chip / server" /></label>
        <label>Title<input :value="lv(h.title, locale)" @input="setLv(h.title, locale, ($event.target as HTMLInputElement).value)" /></label>
        <!-- TONES, not four hard-coded options: this dropdown was the fifth copy
             of that list, and the one that decides what you can pick. -->
        <label>Tone
          <select v-model="h.tone">
            <option v-for="t in TONES" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
      </div>
      <label>Blurb<input :value="lv(h.blurb, locale)" @input="setLv(h.blurb, locale, ($event.target as HTMLInputElement).value)" /></label>
      <div class="actions">
        <button class="link" title="Move up" :disabled="i === 0" @click="hobbiesList.moveTo(i, i - 1)">↑</button>
        <button class="link" title="Move down" :disabled="i === hobbiesList.items.value.length - 1" @click="hobbiesList.moveTo(i, i + 1)">↓</button>
        <button class="link danger" @click="hobbiesList.remove(i)">delete</button>
        <button class="btn" @click="hobbiesList.save(h)">Save</button>
      </div>
    </div>
    <button class="btn ghost" @click="hobbiesList.add()">+ Add hobby</button>
  </section>
</template>
