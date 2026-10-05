<script setup lang="ts">
import LocalizedField from "../LocalizedField.vue";
import { assetRef } from "@lg/core";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const { galleryThumb, locale, lv, meta, openPicker, setLv, tab } =
	useCmsContext();
</script>

<template>
  <section class="pane">
          <div class="card">
            <h3>Identity</h3>
            <p class="muted">Your name, handle, and the eyebrow role line. Shown across the site.</p>
            <label>Name<input v-model="meta.name" /></label>
            <label>Handle<input v-model="meta.handle" /></label>
            <label>Location<LocalizedField :field="meta.location" /></label>
            <label>Role<LocalizedField :field="meta.role" /></label>
            <div class="avatarrow">
              <span class="avatarprev">
                <img v-if="meta.avatar" :src="galleryThumb(meta.avatar)" alt="" @error="($event.target as HTMLImageElement).style.visibility='hidden'" />
                <span v-else class="muted">no image</span>
              </span>
              <div>
                <div class="fieldlabel">Hero image <span class="muted">(optional portrait)</span></div>
                <button class="btn ghost" @click="openPicker((id) => { meta.avatar = assetRef(id); }, 'image')">Choose image</button>
                <button v-if="meta.avatar" class="link danger" @click="meta.avatar = ''">remove</button>
              </div>
            </div>
          </div>
        </section>
</template>
