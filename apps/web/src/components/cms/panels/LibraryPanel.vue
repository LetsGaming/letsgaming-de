<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";
import AssetLibrary from "../AssetLibrary.vue";

// View-only panel. All state and handlers come from the shared CMS context.
const { tab } = useCmsContext();
</script>

<template>
  <section class="pane">
        <div class="card note">
          Your central media library — reusable images, SVGs, GIFs, PDFs and Markdown, referenced
          from anywhere on the site. Upload here, organize with folders and tags, and edit alt/caption
          metadata. Deleting warns you if an asset is in use.
        </div>
        <AssetLibrary v-if="tab === 'library'" />
      </section>
</template>
