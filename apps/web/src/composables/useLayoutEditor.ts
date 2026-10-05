import { computed, nextTick, ref, shallowRef, watch, type Ref } from "vue";
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
import { KIND_LABELS } from "./editorHelpers";
import { type Autosave, bindAutosave } from "./useAutosave";

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
  autosave: Autosave;
  /** Pick a localized string for the current editor locale. */
  pickL: (l?: Localized) => string;
  /** Re-fetch everything (after create/delete gallery, which changes the modules). */
  loadAll: () => Promise<void>;
  cms: {
    put: (resource: string, body: unknown) => Promise<unknown>;
    del: (path: string) => Promise<unknown>;
    preview: (order: { area: string; modules: string[] }[], locale: string) => Promise<SiteView>;
    assetUrl: (id: string, variant: string) => string;
    createGallery: (name: Localized) => Promise<{ id?: string } | undefined>;
    deleteGallery: (id: string) => Promise<unknown>;
  };
}

/** Which panel edits a module's content. `Record<ModuleKind, …>` on purpose: a
 *  new kind shouldn't compile until it says where clicking it lands. `null` is a
 *  real answer for synced modules nothing in the CMS edits. */
export const PANEL_FOR_KIND: Record<ModuleKind, string | null> = {
  hero: "home",
  /* Built from the nav tree, so its content is edited by editing the nav — there's
     no panel of its own to open. Renaming an area or writing its description is
     what changes this module. */
  areas: null,
  teasers: null,
  featured: "featured",
  glance: null,
  activity: null,
  coding: null,
  projects: null,
  hobbies: "hobbies",
  now: "now",
  guestbook: "guestbook",
  gallery: "gallery",
  presence: null,
  playtime: "playtime",
  music: "music",
  wrapped: "wrapped",
  bio: "about",
  contact: "links",
  posts: "posts",
};

const DEFAULT_GALLERY_ID = "gallery";
const PREVIEW_PARAM = "preview";

export function useLayoutEditor(deps: LayoutEditorDeps) {
  const { locale, authed, tab, previewArea, flash, guarded, autosave, pickL, loadAll, cms } = deps;

  // ── placement state (the shared refs the three concerns operate on) ─────────
  const modules = ref<ModuleDescriptor[]>([]);
  const layoutAreas = ref<
    { id: string; label: Localized; modules: string[]; description: Localized }[]
  >([]);
  const hiddenModules = ref<string[]>([]);
  const gallery = ref<GalleryRow[]>([]);
  const activeGallery = ref<string>(DEFAULT_GALLERY_ID);

  const galleryKey = (id: string) => `gallery/${id}`;
  const moduleKey = (id: string) => `modules/${id}`;
  const orderKey = (moduleId: string) => `gallery-order/${moduleId}`;
  /** A gallery's image ids in display order: the shape `PUT /gallery-order` takes. */
  const orderOf = (moduleId: string) => ({
    module: moduleId,
    ids: gallery.value
      .filter((g) => g.module === moduleId)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map((g) => g.id),
  });
  const confirmOrder = (moduleId: string) => autosave.baseline(orderKey(moduleId), "gallery-order", orderOf(moduleId));
  const filled = (l?: Localized) => !!l && Object.values(l).some((v) => v?.trim());
  /** Whether a module had a heading/note when loaded. The server reads an
   *  all-empty one as "clear it", so one that existed must still be sent when emptied. */
  const hadText = new Map<string, { heading: boolean; note: boolean }>();

  /** `PUT /modules` reads an empty `de` as "remove the German text", so unlike
   *  `strip` it must be sent rather than dropped. */
  const withDe = (l: Localized): Localized => ({ en: l.en, de: l.de ?? "" });

  /** One module's heading and note, in the partial shape `PUT /modules` merges by id. */
  function modulePayload(m: ModuleDescriptor) {
    const had = hadText.get(m.id);
    return {
      modules: [
        {
          id: m.id,
          ...(m.heading && (filled(m.heading) || had?.heading) ? { heading: withDe(m.heading) } : {}),
          ...(m.note && (filled(m.note) || had?.note) ? { note: withDe(m.note) } : {}),
        },
      ],
    };
  }

  /** Friendly heading for a module id (falls back to the id). */
  function moduleHeading(id: string): string {
    const m = modules.value.find((x) => x.id === id);
    return (m && (pickL(m.heading) || KIND_LABELS[m.kind])) || id;
  }

  /** Rebuild the placement state from freshly-loaded content. */
  function hydrate(data: { modules?: ModuleDescriptor[]; nav?: NavNode[]; content?: { gallery?: GalleryRow[] } }) {
    // Rows and headings with an unsaved or failed edit keep their local value.
    const fresh = (data.content?.gallery ?? []).map((g, i) => ({ ...g, sort: i }));
    const localRows = gallery.value.filter((g) => autosave.isDirty(galleryKey(g.id)));
    const mergedRows = fresh.map((g) => localRows.find((l) => l.id === g.id) ?? g);
    for (const l of localRows) if (!mergedRows.some((g) => g.id === l.id)) mergedRows.push(l);
    gallery.value = mergedRows;
    for (const g of fresh) autosave.baseline(galleryKey(g.id), galleryKey(g.id), strip(g));

    const priorModules = modules.value;
    modules.value = (data.modules ?? [])
      .filter((m) => isModuleKind(m.kind))
      .map((m) => {
        const local = autosave.isDirty(moduleKey(m.id)) ? priorModules.find((x) => x.id === m.id) : undefined;
        return local ? { ...m, heading: local.heading, note: local.note } : m;
      });
    const leaves: { id: string; label: Localized; modules: string[]; description: Localized }[] = [];
    const walk = (nodes: NavNode[]) => {
      for (const n of nodes) {
        if (n.modules) {
          leaves.push({
            id: n.id,
            // The whole localized value, not a picked string: the nav label is
            // editable now, and an editor bound to the resolved English can only
            // ever write English back.
            label: n.label ? { ...n.label } : emptyL(),
            modules: [...n.modules],
            // Editable as a full localized value, so the German site gets German
            // descriptions rather than the English ones translated by nobody.
            description: n.description ? { ...n.description } : emptyL(),
          });
        }
        if (n.children) walk(n.children);
      }
    };
    walk(data.nav ?? []);
    if (!autosave.isDirty("layout")) {
      layoutAreas.value = leaves;
      confirmLayout();
    }
    const placed = new Set(layoutAreas.value.flatMap((l) => l.modules));
    hiddenModules.value = modules.value.map((m) => m.id).filter((id) => !placed.has(id));
    const firstGallery = modules.value.find((m) => m.kind === MODULE_KIND.gallery);
    if (
      firstGallery &&
      !modules.value.some((m) => m.id === activeGallery.value && m.kind === MODULE_KIND.gallery)
    ) {
      activeGallery.value = firstGallery.id;
    }
    for (const m of modules.value) {
      if (m.kind === MODULE_KIND.gallery) confirmOrder(m.id);
      if (autosave.isDirty(moduleKey(m.id))) continue;
      hadText.set(m.id, { heading: filled(m.heading), note: filled(m.note) });
      autosave.baseline(moduleKey(m.id), "modules", modulePayload(m));
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

  /** Nudge a module one slot within its page. Hidden has no order, so it's a no-op there. */
  function nudgeModule(mid: string, dir: -1 | 1) {
    const at = findModule(mid);
    if (!at || at.listId === HIDDEN_LIST) return;
    const len = moduleList(at.listId)?.length ?? 0;
    const j = at.index + dir;
    if (j < 0 || j >= len) return;
    moveModuleTo(at.listId, at.index, at.listId, j);
  }

  const hideModule = (mid: string) => setModuleArea(mid, HIDDEN_LIST);

  /** Dropping a module into an area (or Hidden) at a given position. */
  function dropModule(move: SortableMove) {
    moveModuleTo(move.from, move.oldIndex, move.to, move.newIndex);
  }

  const areaOptions = computed(() => [
    ...layoutAreas.value.map((a) => ({ id: a.id, label: pickL(a.label) })),
    { id: "hidden", label: "Hidden" },
  ]);

  /**
   * Headings and notes autosave one module at a time, apart from the layout: what a
   * section is called and where it sits are separate questions, and the layout save
   * runs the nav lint, which has nothing to say about a rename.
   */
  let moduleGesture = 0;
  watch(
    modules,
    () => {
      const group = `modules:${++moduleGesture}`;
      for (const m of modules.value) {
        autosave.edit(moduleKey(m.id), modulePayload(m), { path: "modules", label: "Edit heading", group });
      }
    },
    { deep: true },
  );

  // An invalid layout (an empty page) is refused by the server and stays unsaved.
  const confirmLayout = bindAutosave(autosave, {
    path: "layout",
    label: "Edit layout",
    delay: 300,
    source: () => ({
      order: layoutAreas.value.map((a) => ({
        area: a.id,
        modules: a.modules,
        description: strip(a.description),
        label: strip(a.label),
      })),
    }),
  });

  let galleryGesture = 0;
  watch(
    gallery,
    () => {
      const group = `gallery:${++galleryGesture}`;
      for (const g of gallery.value) {
        autosave.edit(galleryKey(g.id), strip(g), { path: galleryKey(g.id), label: "Edit gallery image", group });
      }
    },
    { deep: true },
  );

  // ── gallery: multiple instances, each a gallery module ──────────────────────

  const galleryModules = computed(() => modules.value.filter((m) => m.kind === MODULE_KIND.gallery));
  const activeGalleryItems = computed(() =>
    gallery.value.filter((g) => g.module === activeGallery.value),
  );

  function addGalleryAsset(assetId: string, target = activeGallery.value): Promise<void> {
    const ref = assetRef(assetId);
    if (gallery.value.some((g) => g.asset === ref && g.module === target)) {
      flash("Already in this gallery.");
      return Promise.resolve();
    }
    const item: GalleryRow = {
      id: newId("img"),
      module: target,
      asset: ref,
      caption: emptyL(),
      sort: gallery.value.filter((g) => g.module === target).length,
    };
    gallery.value.push(item);
    // Callers re-resolve the canvas next, so the row must be on the server first.
    return nextTick()
      .then(() => autosave.flush())
      .then(() => confirmOrder(target));
  }

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
    autosave.forget(galleryKey(id));
    const owner = gallery.value.find((g) => g.id === id)?.module;
    gallery.value = gallery.value.filter((g) => g.id !== id);
    if (owner) confirmOrder(owner);
    void guarded(() => cms.del(`gallery/${id}`), "Removed");
  }

  /**
   * Move an image within the active gallery. Every row's `sort` is renumbered and
   * the rows that changed autosave together as one undoable step.
   */
  function reorderGalleryTo(fromIdx: number, toIdx: number) {
    const items = [...activeGalleryItems.value];
    const [moved] = items.splice(fromIdx, 1);
    if (!moved) return;
    items.splice(Math.max(0, Math.min(toIdx, items.length)), 0, moved);

    items.forEach((g, i) => {
      g.sort = i;
      autosave.adopt(galleryKey(g.id), { sort: i });
    });
    const rest = gallery.value.filter((g) => g.module !== activeGallery.value);
    gallery.value = [...rest, ...items];
    // One request carries the whole order, so it can't half-succeed.
    autosave.edit(orderKey(activeGallery.value), orderOf(activeGallery.value), {
      path: "gallery-order",
      label: "Reorder gallery",
      delay: 0,
    });
  }

  function moveGallery(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= activeGalleryItems.value.length) return;
    reorderGalleryTo(i, j);
  }

  function dropGallery(move: SortableMove) {
    reorderGalleryTo(move.oldIndex, move.newIndex);
  }

  /** Creates a (hidden) gallery module and resolves with its id. */
  async function createGallery(nameArg: string): Promise<string | undefined> {
    const name = nameArg.trim();
    if (!name) return undefined;
    let created: string | undefined;
    await guarded(async () => {
      // Written into the locale being edited as well as English, which the type
      // requires. A gallery created while editing German used to be German-named
      // in an `en`-only field, so the German site rendered it via the English
      // fallback and the German column stayed empty — a translation gap created by
      // the act of typing German. Both locales start from the typed name; the
      // editor rail's heading field is where they diverge.
      const label = { en: name, ...(locale.value === "de" ? { de: name } : {}) };
      const res = await cms.createGallery(label);
      await loadAll();
      if (res?.id) activeGallery.value = created = res.id;
    }, "Gallery created");
    return created;
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
  let refreshing: Promise<void> | null = null;
  let refreshAgain = false;
  async function refreshCanvas(): Promise<void> {
    if (!authed.value) return;
    // A request already in flight may have read state from before the change that
    // asked for this one, so one more pass runs when it settles.
    if (refreshing) {
      refreshAgain = true;
      return refreshing;
    }
    canvasLoading.value = true;
    refreshing = (async () => {
      do {
        refreshAgain = false;
        try {
          canvasSite.value = await cms.preview(layoutOrder(), locale.value);
        } catch (e) {
          if (e instanceof AuthError) authed.value = false;
          else flash((e as Error).message || "Couldn't render the preview.");
        }
      } while (refreshAgain);
    })();
    try {
      await refreshing;
    } finally {
      refreshing = null;
      canvasLoading.value = false;
    }
  }

  let canvasTimer: ReturnType<typeof setTimeout> | undefined;
  /** After a save or undo/redo: re-resolve the canvas once the burst settles. */
  function scheduleCanvasRefresh(delay = 250) {
    if (tab.value !== "editor") return;
    clearTimeout(canvasTimer);
    canvasTimer = setTimeout(() => void refreshCanvas(), delay);
  }

  function canvasMove(area: string, oldIndex: number, newIndex: number) {
    moveModuleTo(area, oldIndex, area, newIndex); // refreshes the canvas itself
  }

  /** A module clicked on the canvas: record the selection so the editor renders
   *  that module's panel in its rail, beside the page — no navigation. */
  function canvasSelect(moduleId: string) {
    canvasSelected.value = canvasSelected.value === moduleId ? undefined : moduleId;
  }

  const canvasDeselect = () => {
    canvasSelected.value = undefined;
  };

  const selectedPanel = computed<string | null>(() => {
    const id = canvasSelected.value;
    if (!id) return null;
    const kind = modules.value.find((m) => m.id === id)?.kind;
    return kind ? PANEL_FOR_KIND[kind] : null;
  });

  const insertAt = ref<{ area: string; index: number } | null>(null);
  function canvasInsert(area: string, index: number) {
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

  // The rail must never show a module the canvas isn't displaying.
  watch(
    [previewArea, () => layoutAreas.value.find((a) => a.id === previewArea.value)?.modules.join()],
    () => {
      const id = canvasSelected.value;
      if (!id) return;
      const page = layoutAreas.value.find((a) => a.id === previewArea.value);
      if (!page?.modules.includes(id)) canvasSelected.value = undefined;
    },
  );

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
    nudgeModule,
    hideModule,
    dropModule,
    areaOptions,
    // gallery
    galleryModules,
    activeGalleryItems,
    addGalleryAsset,
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
    scheduleCanvasRefresh,
    canvasMove,
    canvasSelect,
    canvasDeselect,
    selectedPanel,
    insertAt,
    canvasInsert,
    insertModule,
    editorOpen,
    PREVIEW_PARAM,
    previewKeyBump,
  };
}
