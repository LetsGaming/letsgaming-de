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
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useCmsNav, type View } from "./useCmsNav";
import { useCmsSession } from "./useCmsSession";
import { useCmsPreview } from "./useCmsPreview";
import { cms } from "../lib/cms";
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
    // Warm the dashboard's badge (cheap, cached after).
    void loadGuestbook();
  },
  onSaved: () => preview.invalidate(),
});
const { authed, login, loading, tokenInput, toast, flash, boot, signIn, signOut, guarded } = session;

const preview = useCmsPreview();
const { previewArea, previewKey, showDock, previewSrc, viewSite } = preview;
const { tab, pick, NAV_GROUPS, VIEW_TITLES } = useCmsNav({
  onOpen: (view) => {
    if ((view === "guestbook" || view === "dashboard") && !guestbook.value) void loadGuestbook();
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
  strip,
  guarded,
  blank: (i) => ({ id: newId("hobby"), title: emptyL(), blurb: emptyL(), tone: DEFAULT_TONE, sort: i }),
});
const hobbies = hobbiesList.items;
const linksList = useEntityList<Link & { sort?: number }>({
  kind: "links",
  strip,
  guarded,
  blank: (i) => ({ id: newId("link"), label: emptyL(), href: "", sort: i }),
});
const links = linksList.items;
const nowList = useEntityList<NowItem & { sort?: number }>({
  kind: "now",
  strip,
  guarded,
  blank: (i) => ({ id: newId("now"), key: emptyL(), value: emptyL(), sort: i }),
});
const now = nowList.items;

  // Presence/playtime settings — extracted composable (see usePresenceSettings).
  const presence = usePresenceSettings({ guarded, cms });
  const {
    PRESENCE_OPTIONS,
    RETENTION_OPTIONS,
    presenceShow,
    presenceSample,
    presenceRetention,
    presenceHidden,
    togglePresence,
    toggleSample,
    savePresence,
    hydratePresence,
  } = presence;

  // Listening list-display settings — extracted composable (see useMusicSettings).
  const music = useMusicSettings({ guarded, cms });
  const { MUSIC_LIST_BOUNDS, musicInitialCount, musicMaxCount, saveMusic, hydrateMusic } = music;
  // Playtime list-display settings — its own stored value, so its limits can differ.
  // Wrapped's recurring-display schedule — same shape as the two above.
  const wrapped = useWrappedSettings({ guarded, cms });

  const playtime = usePlaytimeSettings({ guarded, cms });
  const { PLAYTIME_LIST_BOUNDS, playtimeInitialCount, playtimeMaxCount, savePlaytime, hydratePlaytime } = playtime;

  // Guestbook moderation — extracted composable (see useGuestbookMod).
  const { guestbook, loadingG, loadGuestbook, moderate, removeEntry } = useGuestbookMod({
    cms,
    authed,
    flash,
    guarded,
  });

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
    METRIC_UNITS,
    medianVisitLength,
  } = useAnalytics({ tab, cms, authed, flash, guarded });

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
  const data = await cms.content();
  Object.assign(meta, data.content.meta);
  Object.assign(headline, data.content.headline);
  Object.assign(lede, data.content.lede);
  Object.assign(status, data.content.status);
  bio.value = data.content.bio;
  hobbies.value = data.content.hobbies.map((h: Hobby, i: number) => ({ ...h, sort: i }));
  links.value = data.content.links.map((l: Link, i: number) => ({ ...l, sort: i }));
  now.value = data.content.now.map((n: NowItem, i: number) => ({ ...n, sort: i }));
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


// Saves
const saveMeta = () => guarded(() => cms.put("meta", strip(meta)));
const saveHeadline = () => guarded(() => cms.put("headline", strip(headline)));
const saveLede = () => guarded(() => cms.put("lede", strip(lede)));
const saveStatus = () => guarded(() => cms.put("status", strip(status)));
const saveBio = () => guarded(() => cms.put("bio", bio.value.map(strip)));

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
  dropModule,
  areaOptions,
  saveLayout,
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
} = useLayoutEditor({
  locale,
  authed,
  tab,
  previewArea,
  flash,
  guarded,
  pickL,
  loadAll,
  cms,
});



function areaLabel(id: string): string {
  return layoutAreas.value.find((a) => a.id === id)?.label ?? id;
}
// Dashboard: quick counts + jump-in links (WP-style landing).
const dashStats = computed<{ label: string; n: number; to: View }[]>(() => [
  { label: "Hobbies", n: hobbies.value.length, to: "hobbies" },
  { label: "Links", n: links.value.length, to: "links" },
  { label: "Right-now items", n: now.value.length, to: "now" },
  { label: "Gallery images", n: gallery.value.length, to: "gallery" },
  { label: "Modules", n: modules.value.length, to: "editor" },
]);

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
    savePresence,
    MUSIC_LIST_BOUNDS,
    musicInitialCount,
    musicMaxCount,
    saveMusic,
    PLAYTIME_LIST_BOUNDS,
    playtimeInitialCount,
    playtimeMaxCount,
    savePlaytime,
    // The Wrapped slice, spread whole: the panel reads every ref plus
    // WRAPPED_BOUNDS off the context, and listing them here too would be a
    // second place to keep in sync.
    ...wrapped,
    guestbook,
    loadingG,
    loadGuestbook,
    moderate,
    removeEntry,
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
    canvasSite,
    canvasSelected,
    canvasLoading,
    refreshCanvas,
    canvasMove,
    canvasSelect,
    canvasInsert,
    insertAt,
    insertModule,
    layoutOrder,
    editorOpen,
    selectedPanel,
    areaOptions,
    saveLayout,
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
    signIn,
    signOut,
    guarded,
    saveMeta,
    saveHeadline,
    saveLede,
    saveStatus,
    saveBio,
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
    METRIC_UNITS,
    medianVisitLength,
    pick,
    previewArea,
    previewKey,
    showDock,
    previewSrc,
    areaLabel,
    viewSite,
    dashStats,
    cms,
  };
}
