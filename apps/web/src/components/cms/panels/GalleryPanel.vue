<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	activeGallery,
	activeGalleryItems,
	addGalleryAsset,
	createGallery,
	deleteGallery,
	gallery,
	galleryModules,
	galleryThumb,
	loading,
	locale,
	moduleHeading,
	moveGallery,
	openPicker,
	removeGalleryItem,
	saveGalleryItem,
	tab,
} = useCmsContext();
</script>

<template>
  <section class="pane">
        <div class="card">
          <div class="galhead">
            <label>Gallery
              <select v-model="activeGallery">
                <option v-for="gm in galleryModules" :key="gm.id" :value="gm.id">{{ moduleHeading(gm.id) }} ({{ gm.id }})</option>
              </select>
            </label>
            <span class="galact">
              <button class="btn" @click="openPicker((id) => addGalleryAsset(id))">+ Add image</button>
              <button class="btn ghost" @click="createGallery">+ New gallery</button>
              <button v-if="activeGallery !== 'gallery'" class="link danger" @click="deleteGallery(activeGallery)">delete this gallery</button>
            </span>
          </div>
          <p class="muted">
            Pick images from the <b>Asset library</b>. Alt text comes from the asset; the caption here
            is gallery-specific. Each gallery is a module — position it via <b>Layout</b>. New
            galleries start hidden until you place them.
          </p>
        </div>
        <div v-if="!activeGalleryItems.length" class="muted">
          This gallery is empty — hit <b>+ Add image</b> to choose from your library.
        </div>
        <div v-for="(g, i) in activeGalleryItems" :key="g.id" class="card gitem">
          <img :src="galleryThumb(g.asset)" class="gthumb" loading="lazy" @error="($event.target as HTMLImageElement).style.visibility='hidden'" />
          <div class="gbody">
            <label>Caption ({{ locale }})
              <input v-model="g.caption[locale]" maxlength="120" placeholder="optional" @blur="saveGalleryItem(g)" />
            </label>
            <div class="actions">
              <button class="link" :disabled="i === 0" @click="moveGallery(i, -1)">↑ up</button>
              <button class="link" :disabled="i === activeGalleryItems.length - 1" @click="moveGallery(i, 1)">↓ down</button>
              <button class="link danger" @click="removeGalleryItem(g.id)">remove</button>
            </div>
          </div>
        </div>
      </section>
</template>
