import { computed, ref, shallowRef, watch, type Ref } from "vue";
import {
  assetRef,
  parseAssetRef,
  isModuleKind,
  MODULE_KIND,
  type Asset,
  type AssetKind,
  type Localized,
  type ModuleDescriptor,
  type ModuleKind,
  type NavNode,
  type SiteView,
} from "@lg/core";
import { AuthError } from "../lib/cms";
import type { SortableMove } from "./sortable";

/**
 * Layout + gallery + canvas — one composable, because they're one tangle.
 *
 * These three read and write the same placement state: which modules exist
 * (`modules`), how they're ordered per area (`layoutAreas`), which are unplaced
 * (`hiddenModules`), and the gallery image rows (`gallery`). The visual editor
 * (canvas) rearranges the same lists the ↑/↓ buttons and the area dropdown do —
 * all through one `moveModuleTo` primitive — and the gallery editor is a second
 * view onto the same `gallery` rows. Splitting them into three composables would
 * mean three owners of one set of refs; keeping the state here, with every
 * operation that touches it, is what makes the ownership clean.
 *
 * `useCms` still hydrates it (from the content it fetches) via `hydrate`, and
 * spreads the result into its return, so panels see the same members.
 */

const HIDDEN_LIST = "hidden";

type GalleryRow = {
  id: string;
  module: string;
  asset: string;
  caption: Localized;
  sort?: number;
};

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;
const emptyL = (): Localized => ({ en: "" });

/** Drop empty `de` so a half-filled localized field saves clean. Mirrors the
 *  parent's `strip`; kept local so the gallery ops don't reach back for it. */
function strip<T>(obj: T): T {
  const clone = JSON.parse(JSON.stringify(obj)) as T;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if ("en" in record && "de" in record && !record.de) delete record.de;
    for (const key of Object.keys(record)) walk(record[key]);
  };
  walk(clone);
  return clone;
}

/** Shared bits the editor needs from the parent CMS. */
export interface LayoutEditorDeps {
  locale: Ref<string>;
  authed: { value: boolean };
  /** The open panel — the canvas re-resolves when it becomes "editor". */
  tab: Ref<string>;
  /** Which area the preview points at; a change re-resolves the canvas. */
  previewArea: Ref<string>;
  flash: (msg: string) => void;
  guarded: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  /** Pick a localized string for the current editor locale. */
  pickL: (l?: Localized) => string;
  /** Re-fetch everything (after create/delete gallery, which changes the modules). */
  loadAll: () => Promise<void>;
  cms: {
    put: (resource: string, body: unknown) => Promise<unknown>;
    del: (path: string) => Promise<unknown>;
    preview: (order: { area: string; modules: string[] }[], locale: string) => Promise<SiteView>;
    assetUrl: (id: string, variant: string) => string;
    reorderGallery: (module: string, ids: string[]) => Promise<unknown>;
    createGallery: (name: Localized) => Promise<{ id?: string } | undefined>;
    deleteGallery: (id: string) => Promise<unknown>;
  };
}

/** Which panel edits a module's content. `Record<ModuleKind, …>` on purpose: a
 *  new kind shouldn't compile until it says where clicking it lands. `null` is a
 *  real answer for synced modules nothing in the CMS edits. */
const PANEL_FOR_KIND: Record<ModuleKind, string | null> = {
  hero: "home",
  featured: null,
  glance: null,
  activity: null,
  coding: null,
  projects: null,
  hobbies: "hobbies",
  now: "now",
  guestbook: "guestbook",
  gallery: "gallery",
  presence: "presence",
  // Playtime shares presence's Discord settings — one set of knobs.
  playtime: "presence",
  // Music too: it's driven by the same presence sampler (the Spotify category is
  // toggled in the same allow-list), so it lands on the presence panel.
  music: "presence",
  // Wrapped gets its own panel: its schedule has nothing to do with the sampler.
  wrapped: "wrapped",
  bio: "about",
  contact: "links",
  posts: "posts",
};

const DEFAULT_GALLERY_ID = "gallery";
const PREVIEW_PARAM = "preview";

export function useLayoutEditor(deps: LayoutEditorDeps) {
  const { locale, authed, tab, previewArea, flash, guarded, pickL, loadAll, cms } = deps;

  // ── placement state (the shared refs the three concerns operate on) ─────────
  const modules = ref<ModuleDescriptor[]>([]);
  const layoutAreas = ref<{ id: string; label: string; modules: string[] }[]>([]);
  const hiddenModules = ref<string[]>([]);
  const gallery = ref<GalleryRow[]>([]);
  const activeGallery = ref<string>(DEFAULT_GALLERY_ID);

  /** Friendly heading for a module id (falls back to the id). */
  function moduleHeading(id: string): string {
    const m = modules.value.find((x) => x.id === id);
    return (m && pickL(m.heading)) || id;
  }

  /** Rebuild the placement state from freshly-loaded content. */
  function hydrate(data: { modules?: ModuleDescriptor[]; nav?: NavNode[]; content?: { gallery?: GalleryRow[] } }) {
    gallery.value = (data.content?.gallery ?? []).map((g, i) => ({ ...g, sort: i }));

    modules.value = (data.modules ?? []).filter((m) => isModuleKind(m.kind));
    const leaves: { id: string; label: string; modules: string[] }[] = [];
    const walk = (nodes: NavNode[]) => {
      for (const n of nodes) {
        if (n.modules) leaves.push({ id: n.id, label: pickL(n.label), modules: [...n.modules] });
        if (n.children) walk(n.children);
      }
    };
    walk(data.nav ?? []);
    layoutAreas.value = leaves;
    const placed = new Set(leaves.flatMap((l) => l.modules));
    hiddenModules.value = modules.value.map((m) => m.id).filter((id) => !placed.has(id));
    const firstGallery = modules.value.find((m) => m.kind === MODULE_KIND.gallery);
    if (
      firstGallery &&
      !modules.value.some((m) => m.id === activeGallery.value && m.kind === MODULE_KIND.gallery)
    ) {
      activeGallery.value = firstGallery.id;
    }
  }

  // ── layout: reorder, move between areas, hide/show ──────────────────────────

  function moduleList(listId: string): string[] | undefined {
    if (listId === HIDDEN_LIST) return hiddenModules.value;
    return layoutAreas.value.find((a) => a.id === listId)?.modules;
  }

  function findModule(mid: string): { listId: string; index: number } | undefined {
    for (const a of layoutAreas.value) {
      const index = a.modules.indexOf(mid);
      if (index !== -1) return { listId: a.id, index };
    }
    const index = hiddenModules.value.indexOf(mid);
    return index === -1 ? undefined : { listId: HIDDEN_LIST, index };
  }

  /**
   * The one layout operation: take the module at `fromIdx` in `fromList` and put
   * it at `toIdx` in `toList`. Works within a bucket or across two, incl. Hidden.
   * Everything that rearranges the layout goes through here — a drag is "position
   * X to position Y", and a single primitive is the only thing that can express it
   * the same way for the buttons, the dropdown, and dragging.
   */
  function moveModuleTo(fromList: string, fromIdx: number, toList: string, toIdx: number) {
    const from = moduleList(fromList);
    const to = moduleList(toList);
    if (!from || !to) return;
    const [mid] = from.splice(fromIdx, 1);
    if (mid === undefined) return;
    to.splice(Math.max(0, Math.min(toIdx, to.length)), 0, mid);
    // The canvas renders a server-resolved snapshot, not the live layout, so it has
    // to be re-resolved after every rearrangement. Doing it here rather than at each
    // call site is the point of having one primitive: the sidebar drag, the ↑/↓
    // buttons and the area dropdown all previously mutated the layout without
    // refreshing, so the preview silently went stale on three of the five paths.
    if (tab.value === "editor") void refreshCanvas();
  }

  /** ↑/↓ — the keyboard path, so the admin clears the a11y floor. */
  function moveModule(areaIdx: number, i: number, dir: -1 | 1) {
    const area = layoutAreas.value[areaIdx];
    if (!area) return;
    const j = i + dir;
    if (j < 0 || j >= area.modules.length) return;
    moveModuleTo(area.id, i, area.id, j);
  }

  /** The area dropdown: appends to the target, because a `<select>` names a
   *  destination and not a position. */
  function setModuleArea(mid: string, target: string) {
    const at = findModule(mid);
    if (!at || at.listId === target) return;
    moveModuleTo(at.listId, at.index, target, moduleList(target)?.length ?? 0);
  }

  /** Dropping a module into an area (or Hidden) at a given position. */
  function dropModule(move: SortableMove) {
    moveModuleTo(move.from, move.oldIndex, move.to, move.newIndex);
  }

  const areaOptions = computed(() => [
    ...layoutAreas.value.map((a) => ({ id: a.id, label: a.label })),
    { id: "hidden", label: "Hidden" },
  ]);

  const saveLayout = () =>
    guarded(
      () => cms.put("layout", { order: layoutAreas.value.map((a) => ({ area: a.id, modules: a.modules })) }),
      "Layout saved",
    );

  // ── gallery: multiple instances, each a gallery module ──────────────────────

  const galleryModules = computed(() => modules.value.filter((m) => m.kind === MODULE_KIND.gallery));
  const activeGalleryItems = computed(() =>
    gallery.value.filter((g) => g.module === activeGallery.value),
  );

  function addGalleryAsset(assetId: string, target = activeGallery.value) {
    const ref = assetRef(assetId);
    if (gallery.value.some((g) => g.asset === ref && g.module === target)) {
      flash("Already in this gallery.");
      return;
    }
    const item: GalleryRow = {
      id: newId("img"),
      module: target,
      asset: ref,
      caption: emptyL(),
      sort: gallery.value.filter((g) => g.module === target).length,
    };
    gallery.value.push(item);
    void guarded(() => cms.put(`gallery/${item.id}`, strip(item)), "Added to gallery");
  }

  const saveGalleryItem = (g: GalleryRow) => guarded(() => cms.put(`gallery/${g.id}`, strip(g)));

  // Reusable asset picker (modal).
  const pickerOpen = ref(false);
  const pickerOnly = ref<AssetKind | "">("");
  let pickerCb: ((id: string, asset: Asset) => void) | null = null;
  function openPicker(cb: (id: string, asset: Asset) => void, only: AssetKind | "" = "") {
    pickerCb = cb;
    pickerOnly.value = only;
    pickerOpen.value = true;
  }
  function onPick(asset: Asset) {
    const cb = pickerCb;
    pickerCb = null;
    pickerOpen.value = false;
    cb?.(asset.id, asset);
  }
  function closePicker() {
    pickerCb = null;
    pickerOpen.value = false;
  }

  const assetIdOf = (ref: string) => parseAssetRef(ref) ?? "";
  const galleryThumb = (ref: string) => cms.assetUrl(assetIdOf(ref), "w320.webp");

  function removeGalleryItem(id: string) {
    gallery.value = gallery.value.filter((g) => g.id !== id);
    void guarded(() => cms.del(`gallery/${id}`), "Removed");
  }

  /**
   * Move an image within the active gallery, and persist the whole order. Reorder
   * the list, send the list; the server renumbers, normalizing `sort` to 0..n-1
   * on every move (the old swap-two-and-PUT-both only held while adjacent).
   */
  function reorderGalleryTo(fromIdx: number, toIdx: number) {
    const items = [...activeGalleryItems.value];
    const [moved] = items.splice(fromIdx, 1);
    if (!moved) return;
    items.splice(Math.max(0, Math.min(toIdx, items.length)), 0, moved);

    const ids = items.map((g) => g.id);
    items.forEach((g, i) => (g.sort = i));
    const rest = gallery.value.filter((g) => g.module !== activeGallery.value);
    gallery.value = [...rest, ...items];

    void guarded(() => cms.reorderGallery(activeGallery.value, ids), "Reordered");
  }

  function moveGallery(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= activeGalleryItems.value.length) return;
    reorderGalleryTo(i, j);
  }

  function dropGallery(move: SortableMove) {
    reorderGalleryTo(move.oldIndex, move.newIndex);
  }

  async function createGallery() {
    const name = prompt("Name for the new gallery (e.g. Travel):")?.trim();
    if (!name) return;
    await guarded(async () => {
      const res = await cms.createGallery({ en: name });
      await loadAll();
      if (res?.id) activeGallery.value = res.id;
    }, "Gallery created");
  }

  function deleteGallery(id: string) {
    if (!confirm("Delete this gallery and all its image placements? (Library assets stay.)")) return;
    void guarded(async () => {
      await cms.deleteGallery(id);
      await loadAll();
    }, "Gallery deleted");
  }

  // ── the editor canvas ───────────────────────────────────────────────────────

  /** The pending layout, as the preview endpoint wants it. */
  const layoutOrder = () => layoutAreas.value.map((a) => ({ area: a.id, modules: a.modules }));

  /**
   * What the canvas renders: the site resolved with the *pending* order.
   * `shallowRef`, not `ref` — a reactive Proxy can't be structured-cloned, so a
   * `ref` here threw `DataCloneError` when posted to the iframe. This is an opaque
   * blob resolved by the server and handed straight on; nothing reads into it.
   */
  const canvasSite = shallowRef<SiteView | null>(null);
  const canvasSelected = ref<string | undefined>();
  const canvasLoading = ref(false);

  /** Re-resolve the pending layout for the canvas — server-side, because it
   *  renders real sections that need a real SiteView. `/api/cms/preview` writes
   *  nothing. */
  async function refreshCanvas() {
    if (!authed.value) return;
    canvasLoading.value = true;
    try {
      canvasSite.value = await cms.preview(layoutOrder(), locale.value);
    } catch (e) {
      if (e instanceof AuthError) authed.value = false;
      else flash((e as Error).message || "Couldn't render the preview.");
    } finally {
      canvasLoading.value = false;
    }
  }

  function canvasMove(area: string, oldIndex: number, newIndex: number) {
    moveModuleTo(area, oldIndex, area, newIndex); // refreshes the canvas itself
  }

  /** A module clicked on the canvas: record the selection so the editor renders
   *  that module's panel in its rail, beside the page — no navigation. */
  function canvasSelect(moduleId: string) {
    canvasSelected.value = canvasSelected.value === moduleId ? undefined : moduleId;
  }

  const selectedPanel = computed<string | null>(() => {
    const id = canvasSelected.value;
    if (!id) return null;
    const kind = modules.value.find((m) => m.id === id)?.kind;
    return kind ? PANEL_FOR_KIND[kind] : null;
  });

  const insertAt = ref<{ area: string; index: number } | null>(null);
  function canvasInsert(area: string, index: number) {
    if (!hiddenModules.value.length) {
      flash("Nothing unplaced to add — every module is already on a page.");
      return;
    }
    insertAt.value = { area, index };
  }
  function insertModule(mid: string) {
    const at = insertAt.value;
    insertAt.value = null;
    if (!at) return;
    const from = findModule(mid);
    if (!from) return;
    moveModuleTo(from.listId, from.index, at.area, at.index);
  }

  const editorOpen = ref(false);

  // Opening the editor, or changing the page/locale, needs a fresh resolve.
  watch([tab, previewArea, locale], () => {
    if (tab.value === "editor") void refreshCanvas();
  });

  const previewKeyBump = ref(0);

  return {
    // state
    modules,
    layoutAreas,
    hiddenModules,
    gallery,
    activeGallery,
    hydrateLayout: hydrate,
    moduleHeading,
    // layout
    moduleList,
    findModule,
    moveModuleTo,
    moveModule,
    setModuleArea,
    dropModule,
    areaOptions,
    saveLayout,
    // gallery
    galleryModules,
    activeGalleryItems,
    addGalleryAsset,
    saveGalleryItem,
    pickerOpen,
    pickerOnly,
    openPicker,
    onPick,
    closePicker,
    assetIdOf,
    galleryThumb,
    removeGalleryItem,
    moveGallery,
    dropGallery,
    createGallery,
    deleteGallery,
    // canvas
    layoutOrder,
    canvasSite,
    canvasSelected,
    canvasLoading,
    refreshCanvas,
    canvasMove,
    canvasSelect,
    selectedPanel,
    insertAt,
    canvasInsert,
    insertModule,
    editorOpen,
    PREVIEW_PARAM,
    previewKeyBump,
  };
}
