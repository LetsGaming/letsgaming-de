<script setup lang="ts">
import { assetRef } from "@lg/core";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. State and handlers come from the shared CMS context.
const { linksList, locale, lv, openPicker, setLv, tab } = useCmsContext();
</script>

<template>
  <section class="pane">
    <div v-for="(l, i) in linksList.items.value" :key="l.id" class="card">
      <div class="grid2">
        <label>ID<input v-model="l.id" /></label>
        <label>Icon
          <span class="iconfield">
            <input v-model="l.icon" placeholder="gh, mail, x, linkedin, … or pick an SVG" />
            <button class="link" type="button" @click="openPicker((id) => { l.icon = assetRef(id); linksList.save(l); }, 'svg')">pick SVG</button>
          </span>
        </label>
        <label>Label<input :value="lv(l.label, locale)" @input="setLv(l.label, locale, ($event.target as HTMLInputElement).value)" /></label>
        <label>Href<input v-model="l.href" /></label>
      </div>
      <label class="check"><input type="checkbox" v-model="l.primary" /> primary</label>
      <div class="actions">
        <button class="link" title="Move up" :disabled="i === 0" @click="linksList.moveTo(i, i - 1)">↑</button>
        <button class="link" title="Move down" :disabled="i === linksList.items.value.length - 1" @click="linksList.moveTo(i, i + 1)">↓</button>
        <button class="link danger" @click="linksList.remove(i)">delete</button>
        <button class="btn" @click="linksList.save(l)">Save</button>
      </div>
    </div>
    <button class="btn ghost" @click="linksList.add()">+ Add link</button>
  </section>
</template>
