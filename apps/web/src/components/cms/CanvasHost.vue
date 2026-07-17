<script setup lang="ts">
/**
 * The editor canvas.
 *
 * Renders the site's real sections — the same `SitePanels` a visitor gets — and
 * lays drag affordances *over* them rather than into them. The sections are
 * untouched: no `data-module` attribute, no edit props, no preview branch. That
 * matters beyond tidiness — the moment a section knows it might be in an editor,
 * every section is a place for editor code to leak into the public bundle, and
 * "does this render the same in the CMS as on the site?" stops having an obvious
 * answer.
 *
 * The overlay works because the canvas knows the module order and the DOM order is
 * the same order: `SitePanels` renders one root per module, in sequence. So the
 * Nth child is the Nth module, and that's all the coupling there is.
 */
import { onMounted, onUnmounted, ref, nextTick } from "vue";
import type { SiteView } from "@lg/core";
import SitePanels from "../SitePanels.vue";
import {
  isSameOrigin,
  isToCanvas,
  type FromCanvas,
} from "../../lib/canvas-protocol";

const site = ref<SiteView | null>(null);
const area = ref("");
const editing = ref(false);
const selected = ref<string | undefined>();

/** Per-module boxes, measured from the rendered sections. */
const boxes = ref<{ id: string; top: number; height: number }[]>([]);
const panels = ref<HTMLElement | null>(null);

const post = (msg: FromCanvas) => window.parent.postMessage(msg, window.location.origin);

/** The module ids this area places, in render order. */
const orderedIds = (): string[] => site.value?.nav.find((a) => a.id === area.value)?.modules ?? [];

/**
 * Measure where each module ended up.
 *
 * Read from the DOM rather than assumed from CSS, because the whole point is to
 * outline what actually rendered — a module that collapsed to zero height is a
 * thing you want to *see* is empty, not a box the overlay invents.
 */
async function measure() {
  await nextTick();
  const host = panels.value?.querySelector(".panel");
  if (!host) return void (boxes.value = []);
  const ids = orderedIds();
  const base = host.getBoundingClientRect().top;
  boxes.value = [...host.children].slice(0, ids.length).map((el, i) => {
    const r = el.getBoundingClientRect();
    return { id: ids[i]!, top: r.top - base, height: r.height };
  });
}

let dragFrom: number | null = null;
const dragOver = ref<number | null>(null);

function onDragStart(i: number, e: DragEvent) {
  dragFrom = i;
  e.dataTransfer?.setData("text/plain", String(i));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function onDragOver(i: number, e: DragEvent) {
  if (dragFrom === null) return;
  e.preventDefault();
  dragOver.value = i;
}
function onDrop(i: number) {
  if (dragFrom === null) return;
  const oldIndex = dragFrom;
  dragFrom = null;
  dragOver.value = null;
  if (oldIndex === i) return;
  post({ type: "canvas:move", area: area.value, oldIndex, newIndex: i });
}
function onDragEnd() {
  dragFrom = null;
  dragOver.value = null;
}

function onMessage(event: MessageEvent) {
  if (!isSameOrigin(event) || !isToCanvas(event.data)) return;
  site.value = event.data.site;
  area.value = event.data.area;
  editing.value = event.data.editing;
  selected.value = event.data.selected;
  void measure();
}

const onResize = () => void measure();

onMounted(() => {
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", onResize);
  // The parent can't know when a client:only island inside an iframe has mounted.
  // Without this it posts into the void and the canvas is blank until something
  // else happens to trigger a re-post — the "works on the second click" bug.
  post({ type: "canvas:ready" });
});
onUnmounted(() => {
  window.removeEventListener("message", onMessage);
  window.removeEventListener("resize", onResize);
});
</script>

<template>
  <div ref="panels" class="canvas" :class="{ editing }">
    <SitePanels v-if="site" :site="site" :area="area" />
    <p v-else class="canvas-empty">Waiting for the editor…</p>

    <!-- Affordances, positioned over the real sections. Not inside them. -->
    <div v-if="editing && site" class="canvas-overlay">
      <div
        v-for="(b, i) in boxes"
        :key="b.id"
        class="canvas-mod"
        :class="{ sel: selected === b.id, over: dragOver === i, empty: b.height < 8 }"
        :style="{ top: b.top + 'px', height: Math.max(b.height, 8) + 'px' }"
        @click="post({ type: 'canvas:select', moduleId: b.id })"
        @dragover="onDragOver(i, $event)"
        @drop="onDrop(i)"
      >
        <span
          class="canvas-grip"
          draggable="true"
          title="Drag to reorder on this page"
          @dragstart="onDragStart(i, $event)"
          @dragend="onDragEnd"
          @click.stop
          >⠿</span
        >
        <span class="canvas-tag">{{ site.modules[b.id]?.kind ?? b.id }}</span>
        <button
          class="canvas-add"
          title="Add a module here"
          @click.stop="post({ type: 'canvas:insert', area, index: i })"
        >
          +
        </button>
      </div>
      <button
        class="canvas-add end"
        title="Add a module at the end"
        :style="{ top: (boxes.at(-1) ? boxes.at(-1)!.top + boxes.at(-1)!.height : 0) + 'px' }"
        @click="post({ type: 'canvas:insert', area, index: boxes.length })"
      >
        +
      </button>
    </div>
  </div>
</template>

<style>
/* Canvas-only chrome. Scoped to this document — it never reaches the site. */
.canvas {
  position: relative;
}
.canvas-empty {
  padding: var(--sp-24);
  color: var(--muted);
  font-size: var(--fs-meta);
}
.canvas.editing .panel {
  /* Room down the left for grips, so they don't sit on the content. */
  padding-left: var(--sp-24);
}
.canvas-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.canvas-mod {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: auto;
  cursor: pointer;
  border: 1px dashed transparent;
  border-radius: var(--r-s);
}
.canvas-mod:hover {
  border-color: var(--line-2);
  background: color-mix(in srgb, var(--ink) 3%, transparent);
}
.canvas-mod.sel {
  border-color: var(--ink);
  border-style: solid;
}
/* Where a dragged module will land. A line, not a fill: the section underneath is
   the thing you're reading, and a wash over it hides the answer. */
.canvas-mod.over::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: -2px;
  height: 3px;
  border-radius: 2px;
  background: var(--ink);
}
/* A module that rendered to nothing still has to be grabbable, or the only way to
   fix an empty module is to know it's there. */
.canvas-mod.empty {
  border-color: var(--line-2);
  background: color-mix(in srgb, var(--ink) 5%, transparent);
}
.canvas-grip,
.canvas-tag,
.canvas-add {
  position: absolute;
  font: 500 11px/1 var(--f-m, monospace);
  color: var(--muted);
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  padding: 3px 5px;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.canvas-mod:hover .canvas-grip,
.canvas-mod:hover .canvas-tag,
.canvas-mod:hover .canvas-add,
.canvas-mod.sel .canvas-grip,
.canvas-mod.sel .canvas-tag,
.canvas-mod.sel .canvas-add {
  opacity: 1;
}
.canvas-grip {
  left: 2px;
  top: 4px;
  cursor: grab;
  font-size: 13px;
}
.canvas-grip:active {
  cursor: grabbing;
}
.canvas-tag {
  right: 4px;
  top: 4px;
}
.canvas-add {
  left: 50%;
  transform: translateX(-50%);
  top: -10px;
  cursor: pointer;
  pointer-events: auto;
  line-height: 1;
  padding: 2px 7px;
}
.canvas-add:hover {
  color: var(--ink);
  border-color: var(--ink);
}
.canvas-add.end {
  position: absolute;
  opacity: 1;
  pointer-events: auto;
}

@media (prefers-reduced-motion: reduce) {
  .canvas-grip,
  .canvas-tag,
  .canvas-add {
    transition: none;
  }
}
</style>
