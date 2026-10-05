<script setup lang="ts">
/**
 * The visual editor.
 *
 * Opening "Pages" goes straight to the canvas on the last edited page. The canvas
 * (`CanvasHost`) takes the screen and renders the site's real sections; this file
 * is its side panel and keyboard layer.
 *
 * The rail has three views: Structure (the page tree, where modules move between
 * pages), Selected (the inspector for the clicked module, a generic `<component :is>`
 * slot that later inspectors plug into) and Page settings (opened from the page name
 * in the top bar).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AreaId } from "@lg/core";
import type { View } from "../../../composables/useCmsNav";
import { vSortable } from "../../../composables/sortable";
import { useCmsContext } from "../../../composables/cmsContext";
import {
	missingTranslation,
	readLastPage,
	shortcutFor,
	writeLastPage,
	type PaletteItem,
} from "../../../composables/editorHelpers";
import { STATS_RANGES, useSectionStats } from "../../../composables/useSectionStats";
import CanvasHost from "../CanvasHost.vue";
import CommandPalette from "../CommandPalette.vue";
import LocalizedField from "../LocalizedField.vue";
import ModuleMenu from "../ModuleMenu.vue";
import ModulePicker from "../ModulePicker.vue";
import ShortcutSheet from "../ShortcutSheet.vue";
import SaveBar from "../SaveBar.vue";
import SyncedInspector from "../SyncedInspector.vue";
import { SYNCED_INFO } from "../../../lib/cmsInspector";
import { PANEL } from "./panelMap";

const {
	addGalleryAsset,
	createGallery,
	areaLabel,
	areaOptions,
	canvasDeselect,
	canvasLoading,
	canvasSelected,
	canvasSite,
	canvasInsert,
	canvasMove,
	canvasSelect,
	dropModule,
	editorOpen,
	findModule,
	hiddenModules,
	hideModule,
	insertAt,
	insertModule,
	layoutAreas,
	locale,
	moduleHeading,
	modules,
	nudgeModule,
	pick,
	pickL,
	previewArea,
	refreshCanvas,
	selectedPanel,
	setModuleArea,
	undo,
	viewSite,
} = useCmsContext();

type RailView = "structure" | "selected" | "page";
/** Nav ids are runtime data; `previewArea` is typed to the built-in ones. */
const goPage = (id: string) => (previewArea.value = id as AreaId);
const railView = ref<RailView>("structure");
const paletteOpen = ref(false);
const helpOpen = ref(false);

const sectionStats = useSectionStats(previewArea);
const statsProp = computed(() =>
	sectionStats.on.value
		? {
				status: sectionStats.status.value,
				stat: sectionStats.placement.value.strip,
				moduleId: sectionStats.placement.value.moduleId,
				perPage: sectionStats.placement.value.perPage,
				visits: sectionStats.data.value?.visits ?? 0,
				rangeLabel: STATS_RANGES.find((r) => r.hours === sectionStats.hours.value)?.label ?? "",
			}
		: null,
);

const editedArea = computed(
	() => layoutAreas.value.find((a) => a.id === previewArea.value) ?? layoutAreas.value[0],
);

const untranslated = computed(() =>
	modules.value.filter((m) => missingTranslation(m, locale.value)).map((m) => m.id),
);
const langTag = computed(() => locale.value.toUpperCase());

/** The panel for the selected module, or nothing: synced modules have none. */
const inspector = computed(() => (selectedPanel.value ? PANEL[selectedPanel.value as View] : undefined));

/**
 * Headings may legitimately be absent (the hero renders its own), so one is
 * materialised on selection: `LocalizedField` edits its target in place and needs an
 * object to write into.
 */
const selectedMeta = computed(() => modules.value.find((m) => m.id === canvasSelected.value));
watch(
	selectedMeta,
	(m) => {
		if (m && !m.heading) m.heading = { en: "" };
	},
	{ immediate: true },
);

watch(canvasSelected, (id) => {
	if (id) railView.value = "selected";
	else if (railView.value === "selected") railView.value = "structure";
});

// Reopen on the page edited last time, once the pages are known.
let restored = false;
watch(
	layoutAreas,
	(areas) => {
		if (restored || !areas.length) return;
		restored = true;
		const last = readLastPage();
		if (last && areas.some((a) => a.id === last)) goPage(last);
	},
	{ immediate: true },
);
watch(previewArea, (id) => {
	if (restored && layoutAreas.value.some((a) => a.id === id)) writeLastPage(id);
});

/** Pick a module in the tree, switching the canvas to the page it lives on. */
function selectFromTree(mid: string) {
	const at = findModule(mid);
	if (at && at.listId !== "hidden") goPage(at.listId);
	canvasSelected.value = mid;
}

function showStructure() {
	railView.value = "structure";
	canvasDeselect();
}

const toggleLocale = () => (locale.value = locale.value === "en" ? "de" : "en");

const paletteItems = computed<PaletteItem[]>(() => [
	...layoutAreas.value.map((a) => ({
		id: `page:${a.id}`,
		label: pickL(a.label) || a.id,
		group: "Page" as const,
		run: () => {
			goPage(a.id);
			showStructure();
		},
	})),
	...modules.value.map((m) => ({
		id: `mod:${m.id}`,
		label: `${moduleHeading(m.id)} (${m.id})`,
		group: "Module" as const,
		run: () => selectFromTree(m.id),
	})),
	{ id: "act:undo", label: undo.undoLabel.value ? `Undo: ${undo.undoLabel.value}` : "Undo", group: "Action", run: () => void undo.undo() },
	{ id: "act:redo", label: undo.redoLabel.value ? `Redo: ${undo.redoLabel.value}` : "Redo", group: "Action", run: () => void undo.redo() },
	{ id: "act:locale", label: `Switch content language to ${locale.value === "en" ? "DE" : "EN"}`, group: "Action", run: toggleLocale },
	{ id: "act:site", label: "Open site in a new tab", group: "Action", run: viewSite },
	{ id: "act:page", label: "Page settings", group: "Action", run: () => (railView.value = "page") },
	{ id: "act:keys", label: "Keyboard shortcuts", group: "Action", run: () => (helpOpen.value = true) },
]);

const modalOpen = computed(() => paletteOpen.value || helpOpen.value || !!insertAt.value);

function onKey(e: KeyboardEvent) {
	const action = shortcutFor(e);
	// Undo and redo are handled once, app-wide, by the CMS context.
	if (!action || action === "undo" || action === "redo") return;
	if (action === "palette") {
		e.preventDefault();
		paletteOpen.value = !paletteOpen.value;
		return;
	}
	if (modalOpen.value) return;
	const sel = canvasSelected.value;
	if (action === "help") helpOpen.value = true;
	else if (action === "deselect") {
		if (sel || railView.value === "page") showStructure();
	} else if (sel && action === "remove") {
		hideModule(sel);
		canvasDeselect();
	} else if (sel) nudgeModule(sel, action === "move-up" ? -1 : 1);
	else return;
	e.preventDefault();
}

async function insertNewGallery(name: string) {
	const id = await createGallery(name);
	if (id) insertModule(id);
}

async function onCanvasUploaded(moduleId: string, asset: { id: string }) {
	await addGalleryAsset(asset.id, moduleId);
	await refreshCanvas();
}

onMounted(() => {
	editorOpen.value = true;
	void refreshCanvas();
	window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <section class="pane editor">
    <CanvasHost
      v-if="editorOpen"
      :site="canvasSite"
      :area="previewArea"
      :area-label="areaLabel(previewArea)"
      :selected="canvasSelected"
      :loading="canvasLoading"
      :untranslated="untranslated"
      :locale="locale"
      :stats="statsProp"
      @retry-stats="sectionStats.reload"
      @move="canvasMove"
      @select="canvasSelect"
      @deselect="showStructure"
      @insert="canvasInsert"
      @uploaded="onCanvasUploaded"
      @close="pick('dashboard')"
    >
      <template #title>
        <strong>Editing</strong>
        <button class="lgedit-pagebtn" title="Page settings" @click="railView = 'page'">
          {{ areaLabel(previewArea) }}
        </button>
      </template>

      <template #actions>
        <select v-model="previewArea" class="lgedit-page-pick" aria-label="Page">
          <option v-for="a in layoutAreas" :key="a.id" :value="a.id">{{ pickL(a.label) }}</option>
        </select>
        <select v-model="locale" class="lgedit-page-pick" aria-label="Content language" title="The language you are writing content in">
          <option value="en">Content: EN</option>
          <option value="de">Content: DE</option>
        </select>
        <button
          class="lgedit-page-pick"
          :aria-pressed="sectionStats.on.value"
          title="Show views, median time and reach for this page"
          @click="sectionStats.on.value = !sectionStats.on.value"
        >
          {{ sectionStats.on.value ? "Hide stats" : "Show stats" }}
        </button>
        <select v-if="sectionStats.on.value" v-model.number="sectionStats.hours.value" class="lgedit-page-pick" aria-label="Stats range">
          <option v-for="r in STATS_RANGES" :key="r.hours" :value="r.hours">{{ r.label }}</option>
        </select>
        <button class="lgedit-page-pick" title="Command palette (Ctrl+K)" @click="paletteOpen = true">Ctrl+K</button>
        <SaveBar />
      </template>

      <template #rail>
        <div class="railtabs" role="tablist">
          <button role="tab" :class="{ on: railView === 'structure' }" :aria-selected="railView === 'structure'" @click="showStructure">
            Structure
          </button>
          <button
            role="tab"
            :class="{ on: railView === 'selected' }"
            :aria-selected="railView === 'selected'"
            :disabled="!canvasSelected"
            @click="railView = 'selected'"
          >
            Selected
          </button>
        </div>

        <!-- Page settings: the page's own name and description, per content language. -->
        <div v-if="railView === 'page' && editedArea" class="pagesettings">
          <div class="railsel">
            <b>Page settings</b>
            <button class="link" @click="showStructure">back</button>
          </div>
          <label class="railfield">Page name ({{ langTag }})
            <LocalizedField :field="editedArea.label" placeholder="The name in the nav, e.g. Life / Leben." />
            <span class="dim railhint">What this page is called in the nav, in the content language.</span>
          </label>
          <label class="railfield">Search description ({{ langTag }})
            <LocalizedField :field="editedArea.description" textarea placeholder="One sentence describing this page for search results and link previews." />
            <span class="dim railhint">
              Shown in search results and when the page is shared. Empty falls back to the site-wide description.
            </span>
          </label>
        </div>

        <!-- Selected: the inspector, beside the page it changes. -->
        <template v-else-if="railView === 'selected' && canvasSelected">
          <div class="railsel">
            <b>{{ moduleHeading(canvasSelected) }}</b>
            <button class="link" title="Back to Structure (Esc)" @click="showStructure">✕</button>
          </div>
          <label v-if="selectedMeta?.heading" class="railfield">Heading ({{ langTag }})
            <LocalizedField :field="selectedMeta.heading" />
            <span class="dim railhint">The text above this section on the page, in the content language.</span>
          </label>

          <SyncedInspector v-if="selectedMeta && SYNCED_INFO[selectedMeta.kind]" :kind="selectedMeta.kind" class="railpanel" />
          <component :is="inspector" v-if="inspector" class="railpanel" />
          <p v-else-if="!selectedMeta || !SYNCED_INFO[selectedMeta.kind]" class="dim railnote">
            Nothing to edit here beyond the heading above.
          </p>
        </template>

        <!-- Structure: every page, with modules draggable between them. -->
        <template v-else>
          <ol
            v-for="a in layoutAreas"
            :key="a.id"
            v-sortable="{ group: 'modules', id: a.id, onMove: dropModule, handle: '.grip', draggable: '.modrow' }"
            class="modlist railbox"
            :class="{ 'railbox-cur': a.id === previewArea }"
          >
            <li class="railhead" @click="goPage(a.id)">
              {{ pickL(a.label) }} <span class="dim">/{{ a.id }}</span>
              <span v-if="a.id === previewArea" class="railcur">editing</span>
            </li>
            <li
              v-for="mid in a.modules"
              :key="mid"
              class="modrow"
              :class="{ cur: mid === canvasSelected }"
              @click="selectFromTree(mid)"
            >
              <span class="grip" aria-hidden="true">⠿</span>
              <span class="modname" :title="moduleHeading(mid)">{{ moduleHeading(mid) }}</span>
              <span v-if="untranslated.includes(mid)" class="tr-missing" :title="`No ${langTag} text yet`">no {{ langTag }}</span>
              <ModuleMenu
                :options="areaOptions"
                :current="a.id"
                :name="moduleHeading(mid)"
                @move="setModuleArea(mid, $event)"
                @hide="hideModule(mid)"
              />
            </li>
            <li v-if="!a.modules.length" class="dropzone dim">empty, drop here</li>
          </ol>

          <h4>Hidden</h4>
          <ol
            v-sortable="{ group: 'modules', id: 'hidden', onMove: dropModule, handle: '.grip', draggable: '.modrow' }"
            class="modlist railbox"
          >
            <li v-for="mid in hiddenModules" :key="mid" class="modrow" @click="selectFromTree(mid)">
              <span class="grip" aria-hidden="true">⠿</span>
              <span class="modname" :title="moduleHeading(mid)">{{ moduleHeading(mid) }}</span>
              <span v-if="untranslated.includes(mid)" class="tr-missing" :title="`No ${langTag} text yet`">no {{ langTag }}</span>
              <ModuleMenu
                :options="areaOptions"
                current="hidden"
                :name="moduleHeading(mid)"
                @move="setModuleArea(mid, $event)"
                @hide="hideModule(mid)"
              />
            </li>
            <li v-if="!hiddenModules.length" class="dropzone dim">nothing hidden</li>
          </ol>
        </template>
      </template>
    </CanvasHost>

    <ModulePicker
      v-if="insertAt"
      :ids="hiddenModules"
      :heading="moduleHeading"
      :target="areaLabel(insertAt.area)"
      @pick="insertModule"
      @new-gallery="insertNewGallery"
      @close="insertAt = null"
    />
    <CommandPalette v-if="paletteOpen" :items="paletteItems" @close="paletteOpen = false" />
    <ShortcutSheet v-if="helpOpen" @close="helpOpen = false" />
  </section>
</template>
