<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const { layoutAreas, previewArea, previewKey, previewSrc, tab, viewSite } =
	useCmsContext();
</script>

<template>
  <section class="pane preview">
          <div class="prevbar">
            <label class="prevpick">Showing
              <select v-model="previewArea">
                <option v-for="a in layoutAreas" :key="a.id" :value="a.id">{{ a.label }}</option>
              </select>
            </label>
            <span class="muted">Reflects everything you've saved — reload after changes.</span>
            <span class="prevact">
              <button class="btn ghost" @click="previewKey++">Reload</button>
              <button class="btn ghost" @click="viewSite">Open in new tab ↗</button>
            </span>
          </div>
          <iframe :key="previewKey + '-' + previewArea" class="prevframe" :src="previewSrc" title="Site preview" />
        </section>
</template>
