<script setup lang="ts">
import { vSortable } from "../../../composables/sortable";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	areaOptions,
	dropModule,
	hiddenModules,
	layoutAreas,
	moduleHeading,
	moveModule,
	saveLayout,
	setModuleArea,
	tab,
} = useCmsContext();

// Every list shares one group, so a module can be dragged from any area into any
// other — and into Hidden, which is what taking it off the site means. Dragging is
// by the grip only: these rows contain a <select>, and a row you can drag from
// anywhere is a row whose dropdown won't open.
const GROUP = "modules";
</script>

<template>
  <section class="pane">
        <div class="card note">
          Every area renders its modules top-to-bottom. Drag a module by its
          <span class="grip" aria-hidden="true">⠿</span> grip to reorder it, or into another area —
          including <b>Hidden</b>, which takes it off the site. ↑/↓ and the dropdown do the same
          from the keyboard. Then <b>Save layout</b>. An area must keep at least one module.
        </div>

        <div v-for="(area, ai) in layoutAreas" :key="area.id" class="card">
          <h3>{{ area.label }} <span class="muted">/{{ area.id }}</span></h3>
          <ol
            v-sortable="{ group: GROUP, id: area.id, onMove: dropModule, handle: '.grip', draggable: '.modrow' }"
            class="modlist"
          >
            <li v-for="(mid, i) in area.modules" :key="mid" class="modrow">
              <span class="grip" title="Drag to reorder, or into another area" aria-hidden="true">⠿</span>
              <span class="modname">{{ moduleHeading(mid) }} <span class="muted">({{ mid }})</span></span>
              <span class="ord">
                <button class="link" :disabled="i === 0" :aria-label="`Move ${moduleHeading(mid)} up`" @click="moveModule(ai, i, -1)">↑</button>
                <button class="link" :disabled="i === area.modules.length - 1" :aria-label="`Move ${moduleHeading(mid)} down`" @click="moveModule(ai, i, 1)">↓</button>
                <select :value="area.id" :aria-label="`Area for ${moduleHeading(mid)}`" @change="setModuleArea(mid, ($event.target as HTMLSelectElement).value)">
                  <option v-for="o in areaOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
                </select>
              </span>
            </li>
            <li v-if="!area.modules.length" class="dropzone muted">Drop a module here — an area can't be empty when you save</li>
          </ol>
        </div>

        <div class="card">
          <h3>Hidden <span class="muted">(not shown anywhere)</span></h3>
          <ol
            v-sortable="{ group: GROUP, id: 'hidden', onMove: dropModule, handle: '.grip', draggable: '.modrow' }"
            class="modlist"
          >
            <li v-for="mid in hiddenModules" :key="mid" class="modrow">
              <span class="grip" title="Drag into an area to place it" aria-hidden="true">⠿</span>
              <span class="modname">{{ moduleHeading(mid) }} <span class="muted">({{ mid }})</span></span>
              <span class="ord">
                <select value="hidden" :aria-label="`Area for ${moduleHeading(mid)}`" @change="setModuleArea(mid, ($event.target as HTMLSelectElement).value)">
                  <option v-for="o in areaOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
                </select>
              </span>
            </li>
            <li v-if="!hiddenModules.length" class="dropzone muted">Nothing hidden — drop a module here to take it off the site</li>
          </ol>
        </div>

        <button class="btn" @click="saveLayout">Save layout</button>
      </section>
</template>
