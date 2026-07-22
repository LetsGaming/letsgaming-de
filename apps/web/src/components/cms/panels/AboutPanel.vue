<script setup lang="ts">
import LocalizedField from "../LocalizedField.vue";
import { assetRef } from "@lg/core";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	addBio,
	bio,
	bioImageRef,
	galleryThumb,
	openPicker,
	saveBio,
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
              <LocalizedField v-else textarea :rows="2" :field="p" />
              <button class="link danger" @click="bio.splice(i, 1)">remove</button>
            </div>
            <div class="actions">
              <button class="link" @click="addBio">+ paragraph</button>
              <button class="link" @click="openPicker((id) => { bio.push({ en: assetRef(id) }); saveBio(); }, 'image')">+ image</button>
              <button class="btn" @click="saveBio">Save bio</button>
            </div>
          </div>
        </section>
</template>
