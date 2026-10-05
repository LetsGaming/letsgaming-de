<script setup lang="ts">
/**
 * The phone editor: pick a page, reorder its modules with Up/Down, and open a
 * module's own inspector (text and image fields) in a full-width sheet. No canvas
 * and no drag and drop. Every change rides the same autosave as the builder.
 */
import { computed, ref, watch } from "vue";
import type { AreaId } from "@lg/core";
import type { View } from "../../composables/useCmsNav";
import { useCmsContext } from "../../composables/cmsContext";
import { moduleRows, readLastPage, writeLastPage } from "../../composables/editorHelpers";
import { SYNCED_INFO } from "../../lib/cmsInspector";
import LocalizedField from "./LocalizedField.vue";
import SyncedInspector from "./SyncedInspector.vue";
import { PANEL } from "./panels/panelMap";

const {
	canvasSelected,
	hiddenModules,
	layoutAreas,
	locale,
	moduleHeading,
	modules,
	nudgeModule,
	pickL,
	previewArea,
	selectedPanel,
	setModuleArea,
} = useCmsContext();

const langTag = computed(() => locale.value.toUpperCase());
const page = computed(() => layoutAreas.value.find((a) => a.id === previewArea.value) ?? layoutAreas.value[0]);
const rows = computed(() =>
	moduleRows(page.value?.modules ?? [], modules.value, locale.value, moduleHeading),
);

let restored = false;
watch(
	layoutAreas,
	(areas) => {
		if (restored || !areas.length) return;
		restored = true;
		const last = readLastPage();
		if (last && areas.some((a) => a.id === last)) previewArea.value = last as AreaId;
	},
	{ immediate: true },
);
watch(previewArea, (id) => {
	if (restored && layoutAreas.value.some((a) => a.id === id)) writeLastPage(id);
	canvasSelected.value = undefined;
});

const selectedMeta = computed(() => modules.value.find((m) => m.id === canvasSelected.value));
watch(
	selectedMeta,
	(m) => {
		if (m && !m.heading) m.heading = { en: "" };
	},
	{ immediate: true },
);
const inspector = computed(() => (selectedPanel.value ? PANEL[selectedPanel.value as View] : undefined));

const toAdd = ref("");
function addModule() {
	if (!toAdd.value || !page.value) return;
	setModuleArea(toAdd.value, page.value.id);
	toAdd.value = "";
}
</script>

<template>
  <section class="pane mobed">
    <template v-if="canvasSelected && selectedMeta">
      <div class="mobed-sheet">
        <div class="mobed-sheethead">
          <button class="btn ghost" type="button" @click="canvasSelected = undefined">← Back</button>
          <b>{{ moduleHeading(canvasSelected) }}</b>
        </div>
        <label v-if="selectedMeta.heading" class="railfield">Heading ({{ langTag }})
          <LocalizedField :field="selectedMeta.heading" />
        </label>
        <SyncedInspector v-if="SYNCED_INFO[selectedMeta.kind]" :kind="selectedMeta.kind" class="railpanel" />
        <component :is="inspector" v-if="inspector" class="railpanel" />
        <p v-else-if="!SYNCED_INFO[selectedMeta.kind]" class="dim railnote">
          Nothing to edit here beyond the heading above.
        </p>
      </div>
    </template>

    <template v-else>
      <label class="railfield">Page
        <select v-model="previewArea" aria-label="Page">
          <option v-for="a in layoutAreas" :key="a.id" :value="a.id">{{ pickL(a.label) || a.id }}</option>
        </select>
      </label>

      <ol class="mobed-list">
        <li v-for="r in rows" :key="r.id" class="mobed-row">
          <button class="mobed-open" type="button" @click="canvasSelected = r.id">
            <span class="modname">{{ r.name }}</span>
            <span v-if="r.missing" class="tr-missing">no {{ langTag }}</span>
          </button>
          <button class="mobed-move" type="button" :disabled="!r.canUp" :aria-label="`Move ${r.name} up`" @click="nudgeModule(r.id, -1)">Up</button>
          <button class="mobed-move" type="button" :disabled="!r.canDown" :aria-label="`Move ${r.name} down`" @click="nudgeModule(r.id, 1)">Down</button>
        </li>
        <li v-if="!rows.length" class="dim">No modules on this page.</li>
      </ol>

      <label v-if="hiddenModules.length" class="railfield">Add module
        <span class="mobed-add">
          <select v-model="toAdd" aria-label="Unplaced module">
            <option value="" disabled>Choose a module</option>
            <option v-for="id in hiddenModules" :key="id" :value="id">{{ moduleHeading(id) }}</option>
          </select>
          <button class="btn" type="button" :disabled="!toAdd" @click="addModule">Add</button>
        </span>
      </label>
    </template>
  </section>
</template>
