<script setup lang="ts">
/**
 * The editor canvas.
 *
 * Renders the site's real sections — the same `SitePanels` a visitor gets — with
 * drag affordances laid *over* them rather than into them. The sections stay
 * untouched: no edit props, no preview branch. The moment a section knows it might
 * be in an editor, every section is a place for editor code to leak into the
 * public bundle.
 *
 * **This was an iframe.** Three reasons were given; one survived contact.
 *
 * - *"It ships no data to a non-admin."* Confused. `/admin` is already a 6.7KB
 *   data-less shell. The requirement was "don't put edit mode on the public site",
 *   and a component behind the same auth meets it identically. A real requirement
 *   got quietly upgraded into an architecture it never asked for.
 * - *"`.cms .card` (0,2,0) out-specifies `.card` (0,1,0)."* True, and not a reason
 *   for a document boundary. `<Teleport to="body">` puts this outside
 *   `<div class="cms">`; `cms.css` has seven selectors outside its namespace, none
 *   of which `app.css` defines, and no bare element rules. Same isolation, no
 *   protocol.
 * - *Device-width previews.* The only irreducible one — an iframe has its own
 *   viewport, so media queries fire at its width. Dropped on purpose: devtools does
 *   it better, and full-screen is an honest desktop width rather than a 660px
 *   column labelled "Desktop".
 *
 * That deleted ~160 lines — `canvas-protocol.ts`, a separate Astro entry, the
 * `canvas:ready` handshake, origin and shape checks — and two bug classes that only
 * exist across a document boundary: `DataCloneError` (postMessage can't clone a Vue
 * proxy) and 16KB of CSS that a `client:only` entry can't be traced for at build.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { SiteView } from "@lg/core";
import SitePanels from "../shell/SitePanels.vue";

const props = defineProps<{
  site: SiteView | null;
  area: string;
  areaLabel: string;
  selected?: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  move: [area: string, from: number, to: number];
  select: [moduleId: string];
  insert: [area: string, index: number];
  close: [];
}>();

/** Per-module boxes, measured from what actually rendered. */
const boxes = ref<{ id: string; top: number; height: number }[]>([]);
const root = ref<HTMLElement | null>(null);

const orderedIds = computed(() => props.site?.nav.find((a) => a.id === props.area)?.modules ?? []);

/**
 * Measure where each module ended up.
 *
 * By **id**, not by position. The first version mapped `.panel`'s Nth child to the
 * Nth module, which assumed one root element per section. Thirteen obliged;
 * `HeroSection` was a fragment of five, so from the hero down every handle sat on a
 * different section than the one it outlined.
 *
 * Read from the DOM rather than computed: the point is to outline what actually
 * rendered, and a module that collapsed to nothing is a thing you want to *see* is
 * empty, not a box the overlay invents.
 */
async function measure() {
  await nextTick();
  const host = root.value?.querySelector(".panel");
  if (!host) return void (boxes.value = []);
  const base = host.getBoundingClientRect().top;
  boxes.value = orderedIds.value.flatMap((id) => {
    const el = host.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    return [{ id, top: r.top - base, height: r.height }];
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
  // Both, every time. preventDefault() is what marks an element a valid drop target
  // — without it `drop` never fires — and a dropEffect that doesn't match
  // effectAllowed makes the browser reject the drop *after* drawing the indicator.
  // Together, that's "it shows you where it will land and then does nothing".
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  dragOver.value = i;
}
function onDrop(i: number) {
  if (dragFrom === null) return;
  const from = dragFrom;
  dragFrom = null;
  dragOver.value = null;
  if (from !== i) emit("move", props.area, from, i);
}
const onDragEnd = () => {
  dragFrom = null;
  dragOver.value = null;
};

/**
 * The canvas is a preview, not a browser.
 *
 * Its links are real — that's the point, they're the site's own — so a click would
 * navigate away and take the whole CMS with it. Caught on the way down, before
 * anything else can act. An in-page anchor still scrolls; scrolling a preview is
 * legitimate.
 */
function onClick(e: MouseEvent) {
  const link = (e.target as Element | null)?.closest?.("a[href]");
  if (!link) return;
  e.preventDefault();
  const href = link.getAttribute("href") ?? "";
  if (href.startsWith("#")) {
    root.value
      ?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") emit("close");
};
const onResize = () => void measure();

watch(() => [props.site, props.area, props.selected], () => void measure());

onMounted(() => {
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKey);
  void measure();
});
onUnmounted(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", onKey);
});

const kindOf = (id: string): string => props.site?.modules[id]?.kind ?? id;
</script>

<template>
  <!--
    Inside `.cms`, deliberately. `position: fixed` covers the screen from anywhere
    (`.cms` sets no transform/filter/contain), and staying a descendant keeps the
    34 custom properties `.cms` defines and the `.cms .modlist`/`.cms .grip` rules
    the rail is built from.

    A `<Teleport to="body">` did escape `.cms .card` — and took the token layer and
    the rail's styling with it, so every `var()` here resolved to nothing and the
    editor rendered with no background at all. `.cms` carries three things and only
    one of them was in the way; the fix is `:not(.lgedit-page *)` on that one, in
    cms.css, four rules.
  -->
  <div ref="root" class="lgedit" @click.capture="onClick">
      <header class="lgedit-bar" @click.stop>
        <strong>Editing {{ areaLabel }}</strong>
        <span v-if="loading" class="lgedit-dim">rendering…</span>
        <span class="lgedit-hint">
          Drag a handle to reorder · click a module to edit it here · <b>+</b> adds one
        </span>
        <span class="lgedit-actions"><slot name="actions" /></span>
        <button class="lgedit-close" title="Close (Esc)" @click="emit('close')">✕ Close</button>
      </header>

      <div class="lgedit-body">
        <div class="lgedit-page">
          <SitePanels v-if="site" :site="site" :area="area" />
          <p v-else class="lgedit-dim lgedit-wait">Rendering the page…</p>

          <!-- Affordances, over the real sections. Never inside them. -->
          <div v-if="site" class="lgedit-overlay">
            <div
              v-for="(b, i) in boxes"
              :key="b.id"
              class="lgedit-mod"
              :class="{ sel: selected === b.id, over: dragOver === i, empty: b.height < 8 }"
              :style="{ top: b.top + 'px', height: Math.max(b.height, 8) + 'px' }"
              @click="emit('select', b.id)"
              @dragover="onDragOver(i, $event)"
              @drop="onDrop(i)"
            >
              <span
                class="lgedit-grip"
                draggable="true"
                title="Drag to reorder"
                @dragstart="onDragStart(i, $event)"
                @dragend="onDragEnd"
                @click.stop
                >⠿</span
              >
              <span class="lgedit-tag">{{ kindOf(b.id) }}</span>
              <button
                class="lgedit-add"
                title="Add a module here"
                @click.stop="emit('insert', area, i)"
              >
                +
              </button>
            </div>
            <button
              class="lgedit-add end"
              title="Add a module at the end"
              :style="{ top: (boxes.at(-1) ? boxes.at(-1)!.top + boxes.at(-1)!.height : 0) + 'px' }"
              @click="emit('insert', area, boxes.length)"
            >
              +
            </button>
          </div>
        </div>

        <aside class="lgedit-rail" @click.stop><slot name="rail" /></aside>
      </div>
  </div>
</template>
