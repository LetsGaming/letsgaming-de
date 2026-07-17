<script setup lang="ts">
/**
 * The visual editor: the site, with handles on it.
 *
 * The canvas is an iframe (`/admin/canvas`) rather than a component here. Two
 * reasons, and they agree — see lib/canvas-protocol.ts. Short version: inside this
 * document `.cms .card` would out-specify the site's `.card`, so the preview would
 * show you admin styling and you'd believe it; and a separate prerendered document
 * lets the canvas hold no data of its own, so nothing unpublished is ever on a
 * public route.
 *
 * A canvas shows one page. Moving a module to *another* page therefore can't be a
 * drag on the canvas — there's nowhere to drop it. That's what the rail is: the
 * other areas, plus Hidden, as drop targets beside the page you're looking at.
 * It's the Widgets screen folded down to one column, and it's why the Layout panel
 * still exists for when you want to see every area at once.
 */
import { computed } from "vue";
import { vSortable } from "../../../composables/sortable";
import { useCmsContext } from "../../../composables/cmsContext";
import { CANVAS_PATH } from "../../../lib/canvas-protocol";

const {
	areaLabel,
	canvasLoading,
	canvasSelected,
	canvasWidth,
	dropModule,
	hiddenModules,
	insertAt,
	insertModule,
	layoutAreas,
	moduleHeading,
	previewArea,
	refreshCanvas,
	saveLayout,
	canvasFrame,
	tab,
	viewSite,
} = useCmsContext();

const CANVAS_SRC = CANVAS_PATH;

/** Areas other than the one on the canvas, plus Hidden — the drop targets for
 *  "put this somewhere else". */
const otherAreas = computed(() => layoutAreas.value.filter((a) => a.id !== previewArea.value));

const WIDTHS = [
	{ id: "full", label: "Desktop", css: "100%" },
	{ id: "tablet", label: "Tablet", css: "820px" },
	{ id: "phone", label: "Phone", css: "390px" },
] as const;
</script>

<template>
  <section class="pane editor">
    <div class="editbar">
      <label>Page
        <select v-model="previewArea">
          <option v-for="a in layoutAreas" :key="a.id" :value="a.id">{{ a.label }}</option>
        </select>
      </label>
      <span class="seg">
        <button
          v-for="w in WIDTHS"
          :key="w.id"
          :class="{ on: canvasWidth === w.css }"
          @click="canvasWidth = w.css"
        >
          {{ w.label }}
        </button>
      </span>
      <span class="editact">
        <span v-if="canvasLoading" class="muted">rendering…</span>
        <button class="link" title="Re-render" @click="refreshCanvas">⟳</button>
        <button class="link" title="Open the real page" @click="viewSite">↗</button>
        <button class="btn" @click="saveLayout">Save layout</button>
      </span>
    </div>

    <p class="muted editnote">
      Drag a module by its grip to reorder this page. Click one to edit its content. Use
      <b>+</b> to add an unplaced module here, or drag onto the rail to move it to another page.
      Nothing is live until <b>Save layout</b>.
    </p>

    <div class="editwrap">
      <div class="canvasbox" :style="{ width: canvasWidth }">
        <iframe ref="canvasFrame" :src="CANVAS_SRC" title="Editor canvas" class="canvasframe" />
      </div>

      <aside class="rail">
        <h4>Move to another page</h4>
        <ol
          v-for="a in otherAreas"
          :key="a.id"
          v-sortable="{ group: 'modules', id: a.id, onMove: dropModule, handle: '.grip', draggable: '.modrow' }"
          class="modlist railbox"
        >
          <li class="railhead muted">{{ a.label }} <span class="muted">/{{ a.id }}</span></li>
          <li v-for="mid in a.modules" :key="mid" class="modrow">
            <span class="grip" aria-hidden="true">⠿</span>
            <span class="modname">{{ moduleHeading(mid) }}</span>
          </li>
          <li v-if="!a.modules.length" class="dropzone muted">empty</li>
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
          <li v-if="!hiddenModules.length" class="dropzone muted">nothing unplaced</li>
        </ol>
      </aside>
    </div>

    <!-- The inserter. Modules are singletons, so this offers what's unplaced
         rather than a palette that copies — you can't have two heroes. -->
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
