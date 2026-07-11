<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	areaOptions,
	hiddenModules,
	layoutAreas,
	moduleHeading,
	modules,
	move,
	moveModule,
	saveLayout,
	setModuleArea,
	tab,
} = useCmsContext();
</script>

<template>
  <section class="pane">
        <div class="card note">
          Every area renders its modules top-to-bottom. Reorder with ↑/↓, move a module to another
          area (or <b>Hidden</b> to take it off the site) with the dropdown, then <b>Save layout</b>.
          An area must keep at least one module.
        </div>
        <div v-for="(area, ai) in layoutAreas" :key="area.id" class="card">
          <h3>{{ area.label }} <span class="muted">/{{ area.id }}</span></h3>
          <ol class="modlist">
            <li v-for="(mid, i) in area.modules" :key="mid">
              <span>{{ moduleHeading(mid) }} <span class="muted">({{ mid }})</span></span>
              <span class="ord">
                <button class="link" :disabled="i === 0" @click="moveModule(ai, i, -1)">↑</button>
                <button class="link" :disabled="i === area.modules.length - 1" @click="moveModule(ai, i, 1)">↓</button>
                <select :value="area.id" @change="setModuleArea(mid, ($event.target as HTMLSelectElement).value)">
                  <option v-for="o in areaOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
                </select>
              </span>
            </li>
            <li v-if="!area.modules.length" class="muted">— empty — move a module here before saving</li>
          </ol>
        </div>
        <div class="card">
          <h3>Hidden <span class="muted">(not shown anywhere)</span></h3>
          <ol v-if="hiddenModules.length" class="modlist">
            <li v-for="mid in hiddenModules" :key="mid">
              <span>{{ moduleHeading(mid) }} <span class="muted">({{ mid }})</span></span>
              <span class="ord">
                <select value="hidden" @change="setModuleArea(mid, ($event.target as HTMLSelectElement).value)">
                  <option v-for="o in areaOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
                </select>
              </span>
            </li>
          </ol>
          <p v-else class="muted">Nothing hidden.</p>
        </div>
        <button class="btn" @click="saveLayout">Save layout</button>
      </section>
</template>
