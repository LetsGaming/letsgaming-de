<script setup lang="ts">
import { assetRef } from "@lg/core";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	addLink,
	delItem,
	links,
	locale,
	lv,
	move,
	openPicker,
	pick,
	saveLink,
	setLv,
	tab,
} = useCmsContext();
</script>

<template>
  <section class="pane">
        <div v-for="l in links" :key="l.id" class="card">
          <div class="grid2">
            <label>ID<input v-model="l.id" /></label>
            <label>Icon
              <span class="iconfield">
                <input v-model="l.icon" placeholder="gh, mail, x, linkedin, … or pick an SVG" />
                <button class="link" type="button" @click="openPicker((id) => { l.icon = assetRef(id); saveLink(l); }, 'svg')">pick SVG</button>
              </span>
            </label>
            <label>Label<input :value="lv(l.label, locale)" @input="setLv(l.label, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Href<input v-model="l.href" /></label>
            <label>Sort<input type="number" v-model.number="l.sort" /></label>
          </div>
          <label class="check"><input type="checkbox" v-model="l.primary" /> primary</label>
          <div class="actions">
            <button class="link" title="Move up" @click="move(links, links.indexOf(l), -1, 'links')">↑</button>
            <button class="link" title="Move down" @click="move(links, links.indexOf(l), 1, 'links')">↓</button>
            <button class="link danger" @click="delItem(links, links.indexOf(l), 'links')">delete</button>
            <button class="btn" @click="saveLink(l)">Save</button>
          </div>
        </div>
        <button class="btn ghost" @click="addLink">+ Add link</button>
      </section>
</template>
