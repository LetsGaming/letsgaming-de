<script setup lang="ts">
import { ref, watch } from "vue";
import { vSortable } from "../../../composables/sortable";
import { useCmsContext } from "../../../composables/cmsContext";
import { cms } from "../../../lib/cms";
import { GALLERY_KINDS, hasFiles, runUploads, type UploadItem } from "../../../lib/upload";
import UploadProgress from "../UploadProgress.vue";

// Edits the gallery selected on the editor canvas, inside the rail.
const {
	activeGallery,
	activeGalleryItems,
	addGalleryAsset,
	canvasSelected,
	deleteGallery,
	dropGallery,
	galleryModules,
	galleryThumb,
	locale,
	moveGallery,
	openPicker,
	refreshCanvas,
	removeGalleryItem,
} = useCmsContext();

watch(
	canvasSelected,
	(id) => {
		if (id && galleryModules.value.some((m) => m.id === id)) activeGallery.value = id;
	},
	{ immediate: true },
);

// Its own group: an image is not a module, and a gallery is not an area. Sharing
// a group name with the module lists would make them exchange items.
const GROUP = "gallery";

const uploadItems = ref<UploadItem[]>([]);
const uploading = ref(false);
const over = ref(false);
let seq = 0;

async function upload(files: File[]) {
	if (!files.length || uploading.value) return;
	uploading.value = true;
	const target = activeGallery.value;
	const first = seq;
	seq += files.length;
	try {
		const assets = await runUploads(files, {
			send: cms.uploadAssetWithProgress,
			onChange: (items) => (uploadItems.value = items),
			allowed: GALLERY_KINDS,
			firstId: first,
		});
		for (const a of assets) await addGalleryAsset(a.id, target);
		if (assets.length) await refreshCanvas();
	} finally {
		uploading.value = false;
	}
}

async function onFiles(e: Event) {
	const input = e.target as HTMLInputElement;
	await upload(Array.from(input.files ?? []));
	input.value = "";
}
function onDragOver(e: DragEvent) {
	if (!hasFiles(e.dataTransfer)) return;
	e.preventDefault();
	over.value = true;
}
function onDrop(e: DragEvent) {
	over.value = false;
	if (!hasFiles(e.dataTransfer)) return;
	e.preventDefault();
	void upload(Array.from(e.dataTransfer?.files ?? []));
}
</script>

<template>
  <section class="pane galinsp" :class="{ over }" @dragover="onDragOver" @dragleave="over = false" @drop="onDrop">
    <div class="galact">
      <button class="btn" @click="openPicker((id) => addGalleryAsset(id))">Add from library</button>
      <label class="btn ghost galup">
        {{ uploading ? "Uploading…" : "Upload" }}
        <input type="file" multiple accept="image/*" :disabled="uploading" hidden @change="onFiles" />
      </label>
      <button v-if="activeGallery !== 'gallery'" class="link danger" @click="deleteGallery(activeGallery)">delete gallery</button>
    </div>
    <UploadProgress :items="uploadItems" @dismiss="uploadItems = []" />
    <p class="muted">Drag an image to reorder; the order here is the order on the site. Drop image files here to upload them.</p>
    <div v-if="!activeGalleryItems.length" class="muted">
      This gallery is empty. Add images from your library or drop files here.
    </div>
    <div
      v-else
      v-sortable="{ group: GROUP, id: activeGallery, onMove: dropGallery, handle: '.gthumb', draggable: '.gitem' }"
      class="glist"
    >
      <div v-for="(g, i) in activeGalleryItems" :key="g.id" class="card gitem">
        <img
          :src="galleryThumb(g.asset)"
          class="gthumb"
          loading="lazy"
          alt=""
          title="Drag to reorder"
          @error="($event.target as HTMLImageElement).style.visibility='hidden'"
        />
        <div class="gbody">
          <label>Caption ({{ locale }})
            <input v-model="g.caption[locale]" maxlength="120" placeholder="optional" />
          </label>
          <div class="actions">
            <button class="link" :disabled="i === 0" :aria-label="`Move image ${i + 1} earlier`" @click="moveGallery(i, -1)">↑ up</button>
            <button class="link" :disabled="i === activeGalleryItems.length - 1" :aria-label="`Move image ${i + 1} later`" @click="moveGallery(i, 1)">↓ down</button>
            <button class="link danger" @click="removeGalleryItem(g.id)">remove</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.galinsp { display: flex; flex-direction: column; gap: var(--sp-8); border-radius: 10px; }
.galinsp.over { outline: 2px dashed var(--ink); outline-offset: 2px; }
.galact { display: flex; flex-wrap: wrap; gap: var(--sp-8); align-items: center; }
.galup { cursor: pointer; }
</style>
