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
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { AuthError, cms, loadToken, setToken } from "../lib/cms";
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


/**
 * The panels, in nav order.
 *
 * A list rather than a bare union, because the URL now names one: a hash is a
 * string a stranger can type, so turning it back into a `View` needs a runtime
 * check, and `Object.keys(VIEW_TITLES) as View[]` would be a cast — a check that
 * cannot fail. The type derives from this, so the two can't disagree.
 */
const VIEWS = [
  "dashboard",
  "site",
  "home",
  "about",
  "hobbies",
  "links",
  "now",
  "editor",
  "posts",
  "gallery",
  "library",
  "presence",
  "music",
  "playtime",
  "wrapped",
  "guestbook",
  "analytics",
] as const;

export type View = (typeof VIEWS)[number];

/** Where the CMS opens when the URL doesn't say. */
const DEFAULT_VIEW: View = "dashboard";

// Grouped left-nav, so it's obvious what each screen edits (a small WP/Typo3 shape).
const NAV_GROUPS: { label: string; items: { id: View; label: string }[] }[] = [
  { label: "", items: [{ id: "dashboard", label: "Dashboard" }] },
  { label: "", items: [{ id: "editor", label: "Editor" }] },
  {
    label: "Content",
    items: [
      { id: "site", label: "Site identity" },
      { id: "home", label: "Home intro" },
      { id: "about", label: "About / bio" },
      { id: "hobbies", label: "Hobbies" },
      { id: "links", label: "Links" },
      { id: "now", label: "Right now" },
    ],
  },
  {
    label: "Structure & media",
    items: [
      { id: "posts", label: "Blog" },
      { id: "library", label: "Asset library" },
      { id: "gallery", label: "Gallery" },
    ],
  },
  {
    label: "Widgets",
    items: [
      { id: "presence", label: "Presence" },
      { id: "music", label: "Listening" },
      { id: "playtime", label: "Played" },
      { id: "wrapped", label: "Wrapped" },
    ],
  },
  { label: "Community", items: [{ id: "guestbook", label: "Guestbook" }] },
  { label: "Insights", items: [{ id: "analytics", label: "Analytics" }] },
];
const VIEW_TITLES: Record<View, string> = {
  dashboard: "Dashboard",
  site: "Site identity",
  home: "Home intro",
  about: "About / bio",
  hobbies: "Hobbies",
  links: "Links",
  now: "Right now",
  editor: "Editor — arrange and write",
  posts: "Blog",
  library: "Asset library",
  gallery: "Gallery",
  presence: "Presence widget",
  music: "Listening list",
  playtime: "Played list",
  guestbook: "Guestbook",
  analytics: "Analytics",
};

export function useCms() {

const authed = ref(false);
const login = ref<string | null>(null);
const loading = ref(true);
const tab = ref<View>(DEFAULT_VIEW);
const locale = ref<Locale>(DEFAULT_LOCALE);
const tokenInput = ref("");
const toast = ref("");

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
    axisBuckets,
    metricTotals,
    chart,
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
function flash(msg: string) {
  toast.value = msg;
  window.setTimeout(() => (toast.value = ""), 2200);
}

async function boot() {
  loadToken();
  loading.value = true;
  try {
    const me = await cms.me();
    login.value = me.login;
    authed.value = true;
    await loadAll();
    // Warm the dashboard's badge (cheap, cached after).
    void loadGuestbook();
  } catch (e) {
    authed.value = false;
  } finally {
    loading.value = false;
  }
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


async function signIn() {
  setToken(tokenInput.value);
  await boot();
  if (!authed.value) flash("That token was rejected.");
}
function signOut() {
  setToken(null);
  authed.value = false;
}

/**
 * Run a write, then toast or handle the failure.
 *
 * `Promise<unknown>`, not `Promise<void>`: now that the API client returns real
 * shapes instead of `any`, every `cms.put(…)` resolves to `{ ok: true }` — and a
 * `Promise<void>` parameter would have meant twenty call sites each wrapping
 * their own `void (await …)` to throw the value away. `guarded` doesn't read the
 * result; it should say so once rather than make everyone prove it.
 */
async function guarded(fn: () => Promise<unknown>, ok = "Saved") {
  try {
    await fn();
    flash(ok);
    previewKey.value++; // any successful save invalidates the preview
  } catch (e) {
    if (e instanceof AuthError) {
      authed.value = false;
      flash("Session expired — sign in again.");
    } else {
      flash((e as Error).message || "Something went wrong.");
    }
  }
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

/**
 * Which panel is open, in the URL.
 *
 * Reloading used to dump you back on Dashboard: the panel was a ref and nothing
 * else, so the one thing you were doing was the one thing the page didn't
 * remember. Sixteen panels deep in the Layout screen, F5 is a punishment.
 *
 * The hash, not localStorage. It survives a reload the same, and it also makes
 * `/admin#analytics` a link you can bookmark, back/forward step through the
 * panels you visited, and two open tabs stop fighting over one stored key — a
 * storage key would mean the tab you *last clicked in* decides where the other
 * one reopens.
 *
 * This isn't a walk-back of ADR 0003. That's routes-over-hash for the *site*,
 * because hidden must be hidden and a shared link has to unfurl as what it points
 * at. Neither is true of an authed single-page admin that renders nothing server
 * side: here the hash is the whole address.
 */
const isView = (value: unknown): value is View =>
  typeof value === "string" && VIEWS.includes(value as View);

/** The panel named by the current URL, or the default. Unknown hashes (a stale
 *  bookmark, a renamed panel) fall back rather than rendering nothing. */
function viewFromHash(): View {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  return isView(id) ? id : DEFAULT_VIEW;
}

/**
 * Open a panel.
 *
 * `push` distinguishes a click (a new history entry, so Back returns you) from
 * restoring what the URL already says (no entry — pushing there would trap Back
 * on the admin page).
 */
function pick(v: View, push = true) {
  tab.value = v;
  if ((v === "guestbook" || v === "dashboard") && !guestbook.value) void loadGuestbook();
  if (v === "analytics" && !analytics.value) void loadAnalytics();
  if (AREA_FOR_VIEW[v]) previewArea.value = AREA_FOR_VIEW[v]!; // remember what to preview
  if (push && typeof window !== "undefined" && viewFromHash() !== v) {
    window.location.hash = v;
  }
}

/** Back/forward, and someone editing the address bar. */
function onHashChange() {
  const next = viewFromHash();
  if (next !== tab.value) pick(next, false);
}

// Live preview: an iframe of the actual site, aimed at the area you're editing.
// Content screens map to the site area that renders them, so the preview shows
// "what you're working on", not the whole page. Saves bump the key to reload.
const AREA_FOR_VIEW: Partial<Record<View, AreaId>> = {
  site: AREA.home,
  home: AREA.home,
  about: AREA.about,
  links: AREA.about,
  hobbies: AREA.life,
  now: AREA.life,
  gallery: AREA.life,
  presence: AREA.life,
  music: AREA.life,
  playtime: AREA.life,
};
const previewArea = ref<AreaId>(AREA.home);
const previewKey = ref(0);

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
const showDock = ref(false); // side-by-side live preview while editing



/**
 * Where the preview points.
 *
 * Areas are routes (ADR 0003), so this is `/life`, not `/#life`. Both of these
 * still built a hash after the tab store and its `location.hash` reader were
 * deleted — a URL nothing reads, so every preview and every "view site" opened
 * Home regardless of the panel, and `AREA_FOR_VIEW` above was feeding a dead
 * fragment. Nothing failed: a hash to nowhere is a valid URL.
 *
 * `areaPath` rather than `areaHref(site.nav, id)`: the CMS doesn't hold the
 * resolved nav, and the first area is the root.
 */
const areaPath = (id: AreaId): string => (id === AREA.home ? "/" : `/${id}`);
const previewSrc = computed(() => `${areaPath(previewArea.value)}?${PREVIEW_PARAM}=1`);
function areaLabel(id: string): string {
  return layoutAreas.value.find((a) => a.id === id)?.label ?? id;
}
function viewSite() {
  window.open(areaPath(previewArea.value), "_blank", "noopener");
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
onMounted(() => {
  // Restore before boot: the gate may render first, but the panel behind it is
  // already the one the URL names, so signing in lands where you left off.
  pick(viewFromHash(), false);
  window.addEventListener("hashchange", onHashChange);
  void boot();
});
onUnmounted(() => {
  window.removeEventListener("hashchange", onHashChange);
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
    axisBuckets,
    metricTotals,
    chart,
    pick,
    AREA_FOR_VIEW,
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
