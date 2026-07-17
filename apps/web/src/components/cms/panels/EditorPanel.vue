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
import { computed } from "vue";
import { vSortable } from "../../../composables/sortable";
import { useCmsContext } from "../../../composables/cmsContext";
import CanvasHost from "../CanvasHost.vue";

const {
	areaLabel,
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
	viewSite,
} = useCmsContext();

/** Areas other than the one on the canvas, plus Unplaced — the drop targets for
 *  "put this somewhere else". */
const otherAreas = computed(() => layoutAreas.value.filter((a) => a.id !== previewArea.value));

function open() {
	editorOpen.value = true;
	void refreshCanvas();
}
</script>

<template>
  <section class="pane editor">
    <div class="editbar">
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
      reorder, click a module to edit it, <b>+</b> to add an unplaced one, or drag onto the
      rail to move it to another page. Nothing is live until <b>Save layout</b>.
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
        <h4>Move to another page</h4>
        <ol
          v-for="a in otherAreas"
          :key="a.id"
          v-sortable="{ group: 'modules', id: a.id, onMove: dropModule, handle: '.grip', draggable: '.modrow' }"
          class="modlist railbox"
        >
          <li class="railhead">{{ a.label }} <span class="dim">/{{ a.id }}</span></li>
          <li v-for="mid in a.modules" :key="mid" class="modrow">
            <span class="grip" aria-hidden="true">⠿</span>
            <span class="modname">{{ moduleHeading(mid) }}</span>
          </li>
          <li v-if="!a.modules.length" class="dropzone dim">empty</li>
        </ol>

        <h4>Unplaced</h4>
        <ol
          v-sortable="{ group: 'modules', id: 'hidden', onMove: dropModule, handle: '.grip', draggable: '.modrow' }"
          class="modlist railbox"
        >
          <li v-for="mid in hiddenModules" :key="mid" class="modrow">
            <span class="grip" aria-hidden="true">⠿</span>
            <span class="modname">{{ moduleHeading(mid) }}</span>
          </li>
          <li v-if="!hiddenModules.length" class="dropzone dim">nothing unplaced</li>
        </ol>
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
