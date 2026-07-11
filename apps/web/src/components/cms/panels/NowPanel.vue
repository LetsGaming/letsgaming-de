<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const { addNow, delItem, locale, lv, move, now, saveNow, setLv, tab } =
	useCmsContext();
</script>

<template>
  <section class="pane">
        <div v-for="n in now" :key="n.id" class="card">
          <div class="grid2">
            <label>ID<input v-model="n.id" /></label>
            <label>Sort<input type="number" v-model.number="n.sort" /></label>
            <label>Key<input :value="lv(n.key, locale)" @input="setLv(n.key, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Value<input :value="lv(n.value, locale)" @input="setLv(n.value, locale, ($event.target as HTMLInputElement).value)" /></label>
          </div>
          <div class="actions">
            <button class="link" title="Move up" @click="move(now, now.indexOf(n), -1, 'now')">↑</button>
            <button class="link" title="Move down" @click="move(now, now.indexOf(n), 1, 'now')">↓</button>
            <button class="link danger" @click="delItem(now, now.indexOf(n), 'now')">delete</button>
            <button class="btn" @click="saveNow(n)">Save</button>
          </div>
        </div>
        <button class="btn ghost" @click="addNow">+ Add row</button>
      </section>
</template>
