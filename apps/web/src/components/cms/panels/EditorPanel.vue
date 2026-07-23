<script setup lang="ts">
/**
 * The visual editor.
 *
 * The canvas is a component (`CanvasHost`) that teleports out of `.cms` and takes
 * the screen. It was an iframe at `/admin/canvas`, which cost a postMessage
 * protocol, a mount handshake, origin and shape checks, a separate build entry —
 * and produced two bugs that can only exist across a document boundary. The
 * justification that survived was device-width previews; devtools does that better,
 * and full-screen is an honest desktop width rather than a 660px column labelled
 * "Desktop".
 *
 * A canvas shows one page, so moving a module to *another* page can't be a drag on
 * it — there's nowhere to drop. That's the rail: the other areas, plus Unplaced,
 * beside the page you're looking at. The Widgets screen folded into one column,
 * which is also why the Layout panel still exists for seeing every area at once.
 */
import { computed, type Component } from "vue";
import type { View } from "../../../composables/useCmsNav";
import { vSortable } from "../../../composables/sortable";
import { useCmsContext } from "../../../composables/cmsContext";
import CanvasHost from "../CanvasHost.vue";
import LocalizedField from "../LocalizedField.vue";
import AboutPanel from "./AboutPanel.vue";
import GalleryPanel from "./GalleryPanel.vue";
import GuestbookPanel from "./GuestbookPanel.vue";
import HobbiesPanel from "./HobbiesPanel.vue";
import HomeIntroPanel from "./HomeIntroPanel.vue";
import LinksPanel from "./LinksPanel.vue";
import NowPanel from "./NowPanel.vue";
import PostsPanel from "./PostsPanel.vue";
import PresencePanel from "./PresencePanel.vue";
import MusicPanel from "./MusicPanel.vue";
import PlaytimePanel from "./PlaytimePanel.vue";
import SiteIdentityPanel from "./SiteIdentityPanel.vue";

/**
 * The panel that edits each kind of module.
 *
 * The same components the CMS's own nav mounts — they take everything from
 * `cmsContext`, so rendering one here beside the page it changes costs nothing and
 * shares no state. That's what makes "edit content in the editor" a map rather
 * than a rewrite.
 */
const PANEL: Partial<Record<View, Component>> = {
	site: SiteIdentityPanel,
	home: HomeIntroPanel,
	about: AboutPanel,
	hobbies: HobbiesPanel,
	links: LinksPanel,
	now: NowPanel,
	posts: PostsPanel,
	gallery: GalleryPanel,
	guestbook: GuestbookPanel,
	presence: PresencePanel,
	music: MusicPanel,
	playtime: PlaytimePanel,
};

const {
	areaLabel,
	areaOptions,
	canvasLoading,
	canvasSelected,
	canvasSite,
	canvasInsert,
	canvasMove,
	canvasSelect,
	dropModule,
	editorOpen,
	hiddenModules,
	insertAt,
	insertModule,
	layoutAreas,
	moduleHeading,
	previewArea,
	refreshCanvas,
	saveLayout,
	selectedPanel,
	setModuleArea,
	viewSite,
} = useCmsContext();

/**
 * The page whose search description the field edits — the one being previewed,
 * which is the page every other control here already acts on.
 *
 * Falls back to the first area so the field is never bound to `undefined`: the
 * preview area is set on mount, but the template renders once before that.
 */
const editedArea = computed(
  () => layoutAreas.value.find((a) => a.id === previewArea.value) ?? layoutAreas.value[0],
);

/** The value the move/hide `<select>` reports. A plain string cast on the DOM
 *  event, so the template stays terse. */
const moveTo = (mid: string, e: Event) => setModuleArea(mid, (e.target as HTMLSelectElement).value);

/** The panel for whatever's selected, or nothing — synced modules have no panel.
 *  `selectedPanel` holds a View or null (its values come from PANEL_FOR_KIND). */
const editing = computed(() => (selectedPanel.value ? PANEL[selectedPanel.value as View] : undefined));

function open() {
	editorOpen.value = true;
	void refreshCanvas();
}
</script>

<template>
  <section class="pane editor">
    <div class="editbar">
      <label v-if="editedArea" class="seo-desc">Search description
        <LocalizedField :field="editedArea.description" textarea placeholder="One sentence describing this page for search results and link previews." />
        <span class="hint">
          Shown in Google and when the page is shared. Leave empty to fall back to
          the site-wide description. Saved with the layout.
        </span>
      </label>

      <label>Page
        <select v-model="previewArea">
          <option v-for="a in layoutAreas" :key="a.id" :value="a.id">{{ a.label }}</option>
        </select>
      </label>
      <span class="editact">
        <button class="link" title="Open the real page" @click="viewSite">↗</button>
        <button class="btn primary" @click="open">Open editor</button>
      </span>
    </div>

    <p class="muted editnote">
      The editor takes the screen so the page renders at a real width. Drag a handle to
      reorder within a page, click a module to <b>edit its content right there</b>, or use a
      module's <b>dropdown</b> to move it to another page or <b>hide</b> it. <b>+</b> adds an
      unplaced one. Content saves as you go; layout isn't live until <b>Save layout</b>.
      <b>Esc</b> closes it.
    </p>

    <CanvasHost
      v-if="editorOpen"
      :site="canvasSite"
      :area="previewArea"
      :area-label="areaLabel(previewArea)"
      :selected="canvasSelected"
      :loading="canvasLoading"
      @move="canvasMove"
      @select="canvasSelect"
      @insert="canvasInsert"
      @close="editorOpen = false"
    >
      <template #actions>
        <select v-model="previewArea" class="lgedit-page-pick">
          <option v-for="a in layoutAreas" :key="a.id" :value="a.id">{{ a.label }}</option>
        </select>
        <button class="lgedit-save" @click="saveLayout">Save layout</button>
      </template>

      <template #rail>
        <!-- A module is selected: edit it here, beside the page it changes. Clicking
             one used to switch the CMS's tab behind the editor, so the only thing
             selecting a module did was leave. -->
        <template v-if="canvasSelected">
          <div class="railsel">
            <b>{{ moduleHeading(canvasSelected) }}</b>
            <button class="link" title="Deselect" @click="canvasSelect(canvasSelected)">✕</button>
          </div>
          <component :is="editing" v-if="editing" class="railpanel" />
          <p v-else class="dim railnote">
            This module renders synced data — there's nothing to edit by hand. It'll
            update itself on the next sync.
          </p>
        </template>

        <template v-else>
          <h4>Pages</h4>
          <ol
            v-for="a in layoutAreas"
            :key="a.id"
            v-sortable="{ group: 'modules', id: a.id, onMove: dropModule, handle: '.grip', draggable: '.modrow' }"
            class="modlist railbox"
            :class="{ 'railbox-cur': a.id === previewArea }"
          >
            <li class="railhead">
              {{ a.label }} <span class="dim">/{{ a.id }}</span>
              <span v-if="a.id === previewArea" class="railcur">editing</span>
            </li>
            <li v-for="mid in a.modules" :key="mid" class="modrow">
              <span class="grip" aria-hidden="true">⠿</span>
              <span class="modname">{{ moduleHeading(mid) }}</span>
              <!-- Drag reorders; this moves between pages or hides, which is the
                   reliable path on touch where a drag between lists is fiddly. -->
              <select class="railmove" :value="a.id" aria-label="Move module" @change="moveTo(mid, $event)">
                <option v-for="o in areaOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </li>
            <li v-if="!a.modules.length" class="dropzone dim">empty — drop here</li>
          </ol>

          <h4>Unplaced</h4>
          <ol
            v-sortable="{ group: 'modules', id: 'hidden', onMove: dropModule, handle: '.grip', draggable: '.modrow' }"
            class="modlist railbox"
          >
            <li v-for="mid in hiddenModules" :key="mid" class="modrow">
              <span class="grip" aria-hidden="true">⠿</span>
              <span class="modname">{{ moduleHeading(mid) }}</span>
              <select class="railmove" :value="'hidden'" aria-label="Add module to a page" @change="moveTo(mid, $event)">
                <option v-for="o in areaOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </li>
            <li v-if="!hiddenModules.length" class="dropzone dim">nothing unplaced</li>
          </ol>
        </template>
      </template>
    </CanvasHost>

    <!-- The inserter. Modules are singletons, so this offers what's unplaced rather
         than a palette that copies — you can't have two heroes. -->
    <div v-if="insertAt" class="pickmask" @click.self="insertAt = null">
      <div class="pickbox">
        <div class="pickhead">
          <b>Add a module to {{ areaLabel(insertAt.area) }}</b>
          <button class="link" @click="insertAt = null">close</button>
        </div>
        <ol class="modlist">
          <li v-for="mid in hiddenModules" :key="mid" class="modrow">
            <span class="modname">{{ moduleHeading(mid) }} <span class="muted">({{ mid }})</span></span>
            <button class="link" @click="insertModule(mid)">add here</button>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>
