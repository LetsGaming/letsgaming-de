<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. State and handlers come from the shared CMS context.
const { nowList, locale, lv, setLv, tab } = useCmsContext();
</script>

<template>
  <section class="pane">
    <div v-for="(n, i) in nowList.items.value" :key="n.id" class="card">
      <div class="grid2">
        <label>ID<input v-model="n.id" /></label>
        <label>Key<input :value="lv(n.key, locale)" @input="setLv(n.key, locale, ($event.target as HTMLInputElement).value)" /></label>
      </div>
      <label>Value<input :value="lv(n.value, locale)" @input="setLv(n.value, locale, ($event.target as HTMLInputElement).value)" /></label>
      <div class="actions">
        <button class="link" title="Move up" :disabled="i === 0" @click="nowList.moveTo(i, i - 1)">↑</button>
        <button class="link" title="Move down" :disabled="i === nowList.items.value.length - 1" @click="nowList.moveTo(i, i + 1)">↓</button>
        <button class="link danger" @click="nowList.remove(i)">delete</button>
        <button class="btn" @click="nowList.save(n)">Save</button>
      </div>
    </div>
    <button class="btn ghost" @click="nowList.add()">+ Add line</button>
  </section>
</template>
