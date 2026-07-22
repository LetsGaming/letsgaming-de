<script setup lang="ts">
import ListItemActions from "../ListItemActions.vue";
import LocalizedField from "../LocalizedField.vue";
import { assetRef } from "@lg/core";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. State and handlers come from the shared CMS context.
const {
	linksList,
	openPicker,
} = useCmsContext();
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
        <label>Label<LocalizedField :field="l.label" /></label>
        <label>Href<input v-model="l.href" /></label>
      </div>
      <label class="check"><input type="checkbox" v-model="l.primary" /> primary</label>
      <div class="actions">
        <ListItemActions :list="linksList" :index="i" :item="l" />
      </div>
    </div>
    <button class="btn ghost" @click="linksList.add()">+ Add link</button>
  </section>
</template>
