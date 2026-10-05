import {
  AREA,
  DEFAULT_LOCALE,
  DEFAULT_TONE,
  parseAssetRef,
  PREVIEW_PARAM,
} from "@lg/core";
import type {
  AreaId,
  GuestbookEntry,
  Headline,
  Hobby,
  Link,
  Locale,
  Localized,
  NowItem,
  SiteMeta,
  Status,
} from "@lg/core";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useCmsNav } from "./useCmsNav";
import { useDashboard } from "./useDashboard";
import { useCmsSession } from "./useCmsSession";
import { useCmsPreview } from "./useCmsPreview";
import { AuthError, cms } from "../lib/cms";
import { bindAutosave, useAutosave } from "./useAutosave";
import { useUndo } from "./useUndo";
import { shortcutFor } from "./editorHelpers";
import { usePresenceSettings } from "./usePresenceSettings";
import { useMusicSettings } from "./useMusicSettings";
import { usePlaytimeSettings } from "./usePlaytimeSettings";
import { useWrappedSettings } from "./useWrappedSettings";
import { useGuestbookMod } from "./useGuestbookMod";
import { useAnalytics } from "./useAnalytics";
import { useLayoutEditor } from "./useLayoutEditor";
import { useEntityList } from "./useEntityList";


/**
 * What the moderation queue shows. This is core's `GuestbookEntry` — it was
 * re-declared here, field for field, including its own `"pending" | "approved" |
 * "rejected"` beside the `GuestbookStatus` that exists to be the one home for
 * exactly those three strings. A hand-copied shape doesn't fail when the original
 * grows a field; it just silently doesn't have it, which is how `ActivityView`
 * lost `freshness`.
 */
export type ModEntry = GuestbookEntry;

/**
 * All CMS editor state + behaviour, lifted out of CmsApp.vue so the component
 * is view-only. Owns the loaded content model, the save/delete/reorder handlers,
 * the asset-picker modal, analytics, and the live-preview wiring.
 */


export function useCms() {

// Routing and the preview dock are their own composables (useCmsNav /
// useCmsPreview). Opening a panel has effects in three places — lazy-loading a
// panel's data, moving the preview, and the URL — so `onOpen` is where they meet,
// rather than a `pick()` that reaches into all of them.
// Session, routing and preview are each their own composable now; what's left
// here is the content model and the saves. `loadContent` and `onSaved` are the
// two things the session can't own — the editor's data, and the fact that a
// preview exists at all.
const session = useCmsSession({
  loadContent: async () => {
    await loadAll();
    // Warm the sidebar badge and whichever panel the URL restored.
    void loadGuestbook();
    void dashboard.loadVisits();
  },
  onSaved: () => preview.invalidate(),
});
const { authed, login, loading, tokenInput, toast, flash, boot, signIn, signOut, guarded } = session;

const preview = useCmsPreview();

// Edits are live: every field saves itself, and this is the one status the top bar shows.
const autosave = useAutosave({
  put: async (path, body, opts) => {
    try {
      return await cms.put(path, body, opts);
    } catch (e) {
      if (e instanceof AuthError) authed.value = false;
      throw e;
    }
  },
  onSaved: (edit) => {
    undo.record(edit);
    preview.invalidate();
    scheduleCanvasRefresh();
  },
});
const { status: autosaveStatus } = autosave;
const undo = useUndo({
  write: (op, value) => autosave.write(op.key, op.path, value),
  onApplied: async () => {
    await loadAll();
    if (analytics.value) await loadAnalytics({ quiet: true });
    preview.invalidate();
    scheduleCanvasRefresh(0);
  },
  onError: (e) => flash((e as Error).message || "Couldn't undo."),
});
const retrySave = () => autosave.retry();

const { previewArea, previewKey, showDock, previewSrc, viewSite } = preview;
const { tab, pick, params, setParams, NAV_GROUPS, VIEW_TITLES } = useCmsNav({
  onOpen: (view) => {
    void autosave.flush();
    if (view === "guestbook" && authed.value) void loadGuestbook({ quiet: !!guestbook.value });
    if (view === "dashboard" && authed.value) {
      void dashboard.loadVisits();
      void loadStatus({ quiet: true });
    }
    if (view === "analytics" && !analytics.value) void loadAnalytics();
    preview.followView(view);
  },
});

const locale = ref<Locale>(DEFAULT_LOCALE);

// Editable state (loaded from the API).
const meta = reactive<SiteMeta>({ name: "", handle: "", location: emptyL(), role: emptyL() });
const headline = reactive<Headline>({ before: emptyL(), highlight: emptyL(), after: emptyL() });
const lede = reactive<Localized>(emptyL());
const status = reactive<Status>({ verb: emptyL(), now: emptyL() });
const bio = ref<Localized[]>([]);
const hobbiesList = useEntityList<Hobby & { sort?: number }>({
  kind: "hobbies",
  noun: "hobby",
  strip,
  guarded,
  autosave,
  blank: (i) => ({ id: newId("hobby"), title: emptyL(), blurb: emptyL(), tone: DEFAULT_TONE, sort: i }),
});
const hobbies = hobbiesList.items;
const linksList = useEntityList<Link & { sort?: number }>({
  kind: "links",
  noun: "link",
  strip,
  guarded,
  autosave,
  blank: (i) => ({ id: newId("link"), label: emptyL(), href: "", sort: i }),
});
const links = linksList.items;
const nowList = useEntityList<NowItem & { sort?: number }>({
  kind: "now",
  noun: "now item",
  strip,
  guarded,
  autosave,
  blank: (i) => ({ id: newId("now"), key: emptyL(), value: emptyL(), sort: i }),
});
const now = nowList.items;

  // Presence/playtime settings — extracted composable (see usePresenceSettings).
  const presence = usePresenceSettings({ autosave });
  const {
    PRESENCE_OPTIONS,
    RETENTION_OPTIONS,
    presenceShow,
    presenceSample,
    presenceRetention,
    presenceHidden,
    togglePresence,
    toggleSample,
    hydratePresence,
  } = presence;

  // Listening list-display settings — extracted composable (see useMusicSettings).
  const music = useMusicSettings({ autosave });
  const { MUSIC_LIST_BOUNDS, musicInitialCount, musicMaxCount, musicDefaultRange, hydrateMusic } =
    music;
  // Playtime list-display settings — its own stored value, so its limits can differ.
  // Wrapped's recurring-display schedule — same shape as the two above.
  const wrapped = useWrappedSettings({ autosave });

  const playtime = usePlaytimeSettings({ autosave });
  const {
    PLAYTIME_LIST_BOUNDS,
    playtimeInitialCount,
    playtimeMaxCount,
    playtimeDefaultRange,
    hydratePlaytime,
  } = playtime;

  // Guestbook moderation — extracted composable (see useGuestbookMod).
  const gbMod = useGuestbookMod({ cms, authed, tab, flash, guarded });
  const { guestbook, loadingG, loadGuestbook, loadStatus } = gbMod;

  // Analytics dashboard — extracted composable (see useAnalytics). Owns its own
  // poll lifecycle; we hand it the shared `tab` ref so it knows when it's showing.
  const {
    METRIC_LABELS,
    metricKeys,
    RANGES,
    CLEARS,
    STACK_COLORS,
    analytics,
    rangeHours,
    customRange,
    setCustomRange,
    clearCustomRange,
    pollFailing,
    metric,
    loadingA,
    clearing,
    analyticsAt,
    loadAnalytics,
    refreshAnalytics,
    setRange,
    clearRange,
    metricTotals,
    comparison,
    zone,
    activeZone,
    setZone,
    chart,
    hovered,
    hoverAt,
    clearHover,
    METRIC_SOURCES,
    SOURCE_LABELS,
    tileKeys,
    medianVisitLength,
    referrerRules,
    addReferrerRule,
    removeReferrerRule,
    at,
    atLabel,
    setAt,
    selectAt,
    filterDim,
    filterKey,
    selectDimension,
    clearDimensionFilter,
    filteredComparison,
    chips,
    clearFilters,
  } = useAnalytics({ tab, cms, authed, flash, guarded, autosave, params, setParams });

function emptyL(): Localized {
  return { en: "" };
}
function lv(obj: Localized, l: Locale) {
  return obj[l] ?? "";
}
function setLv(obj: Localized, l: Locale, val: string) {
  obj[l] = val;
}
async function loadAll() {
  // Unsent edits go first: hydrating replaces the editor state with the server's.
  await autosave.flush();
  const data = await cms.content();
  // A document whose save failed (or was edited during the fetch) keeps its local value.
  if (!autosave.isDirty("meta")) Object.assign(meta, data.content.meta);
  if (!autosave.isDirty("headline")) Object.assign(headline, data.content.headline);
  if (!autosave.isDirty("lede")) Object.assign(lede, data.content.lede);
  if (!autosave.isDirty("status")) Object.assign(status, data.content.status);
  if (!autosave.isDirty("bio")) bio.value = data.content.bio;
  hobbiesList.set(data.content.hobbies.map((h: Hobby, i: number) => ({ ...h, sort: i })));
  linksList.set(data.content.links.map((l: Link, i: number) => ({ ...l, sort: i })));
  nowList.set(data.content.now.map((n: NowItem, i: number) => ({ ...n, sort: i })));
  for (const confirm of confirmDocs) confirm();
  hydratePresence(data.content.presence);
  hydrateMusic(data.content.music);
  hydratePlaytime(data.content.playtime);
  wrapped.hydrateWrapped(data.content.wrapped);
  hydrateLayout(data);
}

/** Pick a localized string for the current editor locale, with fallbacks. */
function pickL(l?: Localized): string {
  return (l && (l[locale.value] ?? l.en ?? Object.values(l)[0])) || "";
}


// Autosave: each document saves itself when it changes. Hydrating records the
// loaded state as confirmed, so loading is never mistaken for an edit.
const confirmDocs = [
  bindAutosave(autosave, { path: "meta", label: "Edit site identity", source: () => strip(meta) }),
  bindAutosave(autosave, { path: "headline", label: "Edit headline", source: () => strip(headline) }),
  bindAutosave(autosave, { path: "lede", label: "Edit intro", source: () => strip(lede) }),
  bindAutosave(autosave, { path: "status", label: "Edit status line", source: () => strip(status) }),
  bindAutosave(autosave, { path: "bio", label: "Edit bio", source: () => bio.value.map(strip) }),
];

// Undo and redo live in the same shortcut layer as the editor's, which keeps them
// out of text fields where the browser's own undo applies.
function onUndoKey(e: KeyboardEvent) {
  const action = shortcutFor(e);
  if (action !== "undo" && action !== "redo") return;
  e.preventDefault();
  void (action === "undo" ? undo.undo() : undo.redo());
}
// pagehide is the only reliable unload signal on mobile; hidden covers tab switches.
const flushNow = () => void autosave.flush(true);
const flushSoon = () => void autosave.flush();
const onVisibility = () => document.visibilityState === "hidden" && flushNow();
onMounted(() => {
  window.addEventListener("keydown", onUndoKey);
  window.addEventListener("pagehide", flushNow);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("focusout", flushSoon);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onUndoKey);
  window.removeEventListener("pagehide", flushNow);
  document.removeEventListener("visibilitychange", onVisibility);
  document.removeEventListener("focusout", flushSoon);
  flushNow();
});

// Adders
// Seed a unique id per new row. A fixed default like "new-link" would collide on
// the primary key if two rows are added before renaming (applies to hobbies/
// links/now alike); the timestamp suffix keeps each new row distinct.
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;
const addBio = () => bio.value.push(emptyL());
// A bio paragraph is an "image block" when its (locale-independent) value is an asset ref.
function bioImageRef(p: Localized): string {
  const v = (p.en ?? "").trim();
  return parseAssetRef(v) ? v : "";
}

/**
 * Drop empty `de` keys so we don't persist blank translations.
 *
 * `unknown` walked and narrowed, not `any`: a JSON tree genuinely has no static
 * shape, which is the one place `unknown` is the honest type — `any` here would
 * be the same claim with the checking switched off.
 */
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


// Analytics
/**
 * The headline metrics, in the order they read as an argument.
 *
 * `pageviews` and `sections` are not two facts, they're a bracket. The log can
 * only say a request *claimed* to be a browser; the beacon can only fire if one
 * actually ran. So page views are the ceiling on human traffic and section views
 * the floor, and the gap is people with JS off, people who opted out, and bots
 * that lied about being bots. `bots` is the ones that didn't lie.
 *
 * Still hand-matched to the server's `chart` object — see SWEEP §4. That's the
 * next thing to fix here, not this.
 */

// Layout + gallery + canvas — extracted composable (see useLayoutEditor). It owns
// the placement state (modules, layoutAreas, hiddenModules, gallery) and every
// operation that touches it; useCms hydrates it from loaded content.
const {
  modules,
  layoutAreas,
  hiddenModules,
  gallery,
  activeGallery,
  hydrateLayout,
  moduleHeading,
  moduleList,
  findModule,
  moveModuleTo,
  moveModule,
  setModuleArea,
  nudgeModule,
  hideModule,
  dropModule,
  areaOptions,
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
} = useLayoutEditor({
  locale,
  authed,
  tab,
  previewArea,
  flash,
  guarded,
  autosave,
  pickL,
  loadAll,
  cms,
});



function areaLabel(id: string): string {
  const area = layoutAreas.value.find((a) => a.id === id);
  return (area && pickL(area.label)) || id;
}
const dashboard = useDashboard({
  cms,
  authed,
  flash,
  loadStatus,
  pages: layoutAreas,
  areaLabel,
  goPage: (id) => (previewArea.value = id as typeof previewArea.value),
  pick: (v) => pick(v),
});

// Start/stop the analytics poll as the panel opens and closes. A watcher rather
// than a hook inside AnalyticsPanel, because the panel is `v-show` — it stays
// mounted once rendered, so mount/unmount say nothing about whether you can see it.
// useCmsNav restores the panel from the URL on mount; this is just the session.
onMounted(() => {
  void boot();
});

  return {
    NAV_GROUPS,
    VIEW_TITLES,
    authed,
    login,
    loading,
    tab,
    locale,
    tokenInput,
    toast,
    meta,
    headline,
    lede,
    status,
    bio,
    hobbies,
    links,
    now,
    analytics,
    modules,
    layoutAreas,
    hiddenModules,
    gallery,
    activeGallery,
    PRESENCE_OPTIONS,
    RETENTION_OPTIONS,
    presenceShow,
    presenceSample,
    presenceRetention,
    presenceHidden,
    togglePresence,
    toggleSample,
    MUSIC_LIST_BOUNDS,
    musicInitialCount,
    musicMaxCount,
    musicDefaultRange,
    PLAYTIME_LIST_BOUNDS,
    playtimeInitialCount,
    playtimeMaxCount,
    playtimeDefaultRange,
    // The Wrapped slice, spread whole: the panel reads every ref plus
    // WRAPPED_BOUNDS off the context, and listing them here too would be a
    // second place to keep in sync.
    ...wrapped,
    ...gbMod,
    ...dashboard,
    emptyL,
    lv,
    setLv,
    flash,
    boot,
    loadAll,
    pickL,
    moduleHeading,
    moveModule,
    dropModule,
    setModuleArea,
    nudgeModule,
    hideModule,
    findModule,
    canvasSite,
    canvasSelected,
    canvasLoading,
    refreshCanvas,
    canvasMove,
    canvasSelect,
    canvasDeselect,
    canvasInsert,
    insertAt,
    insertModule,
    layoutOrder,
    editorOpen,
    selectedPanel,
    areaOptions,
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
    signIn,
    signOut,
    guarded,
    autosave,
    autosaveStatus,
    undo,
    retrySave,
    hobbiesList,
    linksList,
    nowList,
    newId,
    addBio,
    bioImageRef,
    strip,
    METRIC_LABELS,
    metricKeys,
    RANGES,
    CLEARS,
    STACK_COLORS,
    rangeHours,
    customRange,
    setCustomRange,
    clearCustomRange,
    pollFailing,
    metric,
    loadingA,
    clearing,
    loadAnalytics,
    refreshAnalytics,
    analyticsAt,
    setRange,
    clearRange,
    metricTotals,
    comparison,
    zone,
    activeZone,
    setZone,
    chart,
    hovered,
    hoverAt,
    clearHover,
    METRIC_SOURCES,
    SOURCE_LABELS,
    tileKeys,
    medianVisitLength,
    referrerRules,
    addReferrerRule,
    removeReferrerRule,
    at,
    atLabel,
    setAt,
    selectAt,
    filterDim,
    filterKey,
    selectDimension,
    clearDimensionFilter,
    filteredComparison,
    chips,
    clearFilters,
    pick,
    previewArea,
    previewKey,
    showDock,
    previewSrc,
    areaLabel,
    viewSite,
    cms,
  };
}
