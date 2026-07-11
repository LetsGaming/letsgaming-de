<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const { addHobby, delItem, hobbies, locale, lv, move, saveHobby, setLv, tab } =
	useCmsContext();
</script>

<template>
  <section class="pane">
        <div v-for="h in hobbies" :key="h.id" class="card">
          <div class="grid2">
            <label>ID<input v-model="h.id" /></label>
            <label>Icon<input v-model="h.icon" placeholder="game / plant / chip / server" /></label>
            <label>Title<input :value="lv(h.title, locale)" @input="setLv(h.title, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Tone
              <select v-model="h.tone"><option>purple</option><option>coral</option><option>mint</option><option>sun</option></select>
            </label>
            <label>Sort<input type="number" v-model.number="h.sort" /></label>
          </div>
          <label>Blurb<input :value="lv(h.blurb, locale)" @input="setLv(h.blurb, locale, ($event.target as HTMLInputElement).value)" /></label>
          <div class="actions">
            <button class="link" title="Move up" @click="move(hobbies, hobbies.indexOf(h), -1, 'hobbies')">↑</button>
            <button class="link" title="Move down" @click="move(hobbies, hobbies.indexOf(h), 1, 'hobbies')">↓</button>
            <button class="link danger" @click="delItem(hobbies, hobbies.indexOf(h), 'hobbies')">delete</button>
            <button class="btn" @click="saveHobby(h)">Save</button>
          </div>
        </div>
        <button class="btn ghost" @click="addHobby">+ Add hobby</button>
      </section>
</template>
