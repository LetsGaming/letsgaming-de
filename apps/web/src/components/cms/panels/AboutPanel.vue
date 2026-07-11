<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	addBio,
	bio,
	bioImageRef,
	galleryThumb,
	locale,
	lv,
	openPicker,
	saveBio,
	setLv,
	tab,
} = useCmsContext();
</script>

<template>
  <section class="pane">
          <div class="card">
            <h3>Bio <span class="muted">(paragraphs, **bold** supported; images are library assets)</span></h3>
            <div v-for="(p, i) in bio" :key="i" class="row">
              <div v-if="bioImageRef(p)" class="bioimg">
                <img :src="galleryThumb(bioImageRef(p))" @error="($event.target as HTMLImageElement).style.visibility='hidden'" />
                <span class="muted">image</span>
              </div>
              <textarea v-else :value="lv(p, locale)" @input="setLv(p, locale, ($event.target as HTMLTextAreaElement).value)" rows="2" />
              <button class="link danger" @click="bio.splice(i, 1)">remove</button>
            </div>
            <div class="actions">
              <button class="link" @click="addBio">+ paragraph</button>
              <button class="link" @click="openPicker((id) => { bio.push({ en: 'asset:' + id }); saveBio(); }, 'image')">+ image</button>
              <button class="btn" @click="saveBio">Save bio</button>
            </div>
          </div>
        </section>
</template>
