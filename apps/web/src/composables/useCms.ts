import {
  AREA,
  assetRef,
  CLEAR_RANGES,
  DEFAULT_GALLERY_ID,
  DEFAULT_LOCALE,
  DEFAULT_TONE,
  isModuleKind,
  MODULE_KIND,
  parseAssetRef,
  PRESENCE_CATEGORIES,
  PREVIEW_PARAM,
  VIEW_RANGES,
} from "@lg/core";
import type {
  AreaId,
  Asset,
  AssetKind,
  SiteView,
  ClearRangeId,
  GuestbookEntry,
  Hobby,
  Link,
  Locale,
  Localized,
  ModuleDescriptor,
  ModuleKind,
  NavNode,
  NowItem,
  PresenceCategory,
} from "@lg/core";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { AuthError, cms, loadToken, setToken } from "../lib/cms";
import type { SortableMove } from "./sortable";
import { isFromCanvas, isSameOrigin, type ToCanvas } from "../lib/canvas-protocol";

export interface GalleryRow { id: string; module: string; asset: string; caption: Localized; sort?: number }

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
  "layout",
  "posts",
  "gallery",
  "library",
  "presence",
  "guestbook",
  "analytics",
  "preview",
] as const;

type View = (typeof VIEWS)[number];

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
      { id: "layout", label: "Layout" },
      { id: "posts", label: "Blog" },
      { id: "library", label: "Asset library" },
      { id: "gallery", label: "Gallery" },
    ],
  },
  { label: "Widgets", items: [{ id: "presence", label: "Presence" }] },
  { label: "Community", items: [{ id: "guestbook", label: "Guestbook" }] },
  { label: "Insights", items: [{ id: "analytics", label: "Analytics" }] },
  { label: "", items: [{ id: "preview", label: "Preview" }] },
];
const VIEW_TITLES: Record<View, string> = {
  dashboard: "Dashboard",
  site: "Site identity",
  home: "Home intro",
  about: "About / bio",
  hobbies: "Hobbies",
  links: "Links",
  now: "Right now",
  editor: "Editor — drag the page",
  layout: "Layout — every area at once",
  posts: "Blog",
  library: "Asset library",
  gallery: "Gallery",
  presence: "Presence widget",
  guestbook: "Guestbook",
  analytics: "Analytics",
  preview: "Live preview",
};

const authed = ref(false);
const login = ref<string | null>(null);
const loading = ref(true);
const tab = ref<View>(DEFAULT_VIEW);
const locale = ref<Locale>(DEFAULT_LOCALE);
const tokenInput = ref("");
const toast = ref("");

// Editable state (loaded from the API).
const meta = reactive<any>({ name: "", handle: "", location: emptyL(), role: emptyL() });
const headline = reactive<any>({ before: emptyL(), highlight: emptyL(), after: emptyL() });
const lede = reactive<Localized>(emptyL());
const status = reactive<any>({ verb: emptyL(), now: emptyL() });
const bio = ref<Localized[]>([]);
const hobbies = ref<(Hobby & { sort?: number })[]>([]);
const links = ref<(Link & { sort?: number })[]>([]);
const now = ref<(NowItem & { sort?: number })[]>([]);
const analytics = ref<any>(null);

// Layout (module order per area) + gallery images.

/** The module registry as the API returns it. `kind` is narrowed on load rather
 *  than trusted: it arrives as JSON, and `m.kind === "gallery"` against a loose
 *  string is a comparison that can't fail and can't be renamed. */
const modules = ref<ModuleDescriptor[]>([]);
const layoutAreas = ref<{ id: string; label: string; modules: string[] }[]>([]);
const hiddenModules = ref<string[]>([]);
const gallery = ref<GalleryRow[]>([]);
const activeGallery = ref<string>(DEFAULT_GALLERY_ID);

/**
 * The presence toggles, one per category.
 *
 * Copy lives here (it's UI); the *list* comes from PRESENCE_CATEGORIES, which is
 * what the resolver filters on and the write schema validates against. It used to
 * be a hand-written array of `{ key: string }` — so a seventh category would have
 * appeared in the type, the schema and the renderer, and never in this panel, and
 * a renamed one would have rendered a toggle that silently saved nothing. That's
 * the tile-tone bug: a dropdown offering a value nothing downstream honours.
 */
const PRESENCE_COPY: Record<PresenceCategory, { label: string; hint: string }> = {
  game: { label: "Games", hint: "Discord 'Playing …'" },
  streaming: { label: "Streaming", hint: "going live" },
  music: { label: "Music", hint: "Spotify" },
  watching: { label: "Watching", hint: "e.g. YouTube" },
  custom: { label: "Custom status", hint: "your set status + emoji" },
  steam: { label: "Steam", hint: "recently-played section" },
};
const PRESENCE_OPTIONS: { key: PresenceCategory; label: string; hint: string }[] =
  PRESENCE_CATEGORIES.map((key) => ({ key, ...PRESENCE_COPY[key] }));

const presenceShow = ref<PresenceCategory[]>([]);
function togglePresence(key: PresenceCategory) {
  const s = presenceShow.value;
  presenceShow.value = s.includes(key) ? s.filter((k) => k !== key) : [...s, key];
}
const savePresence = () => guarded(() => cms.put("presence", { show: presenceShow.value }));

// Guestbook moderation queue.

const guestbook = ref<{ entries: ModEntry[]; pending: number } | null>(null);
const loadingG = ref(false);

async function loadGuestbook() {
  loadingG.value = true;
  try {
    guestbook.value = await cms.guestbook();
  } catch (e) {
    if (e instanceof AuthError) authed.value = false;
    else flash((e as Error).message || "Couldn't load the guestbook.");
  } finally {
    loadingG.value = false;
  }
}
function moderate(id: number, action: "approve" | "reject") {
  void guarded(async () => {
    await cms.moderate(id, action);
    await loadGuestbook();
  }, action === "approve" ? "Approved" : "Rejected");
}
function removeEntry(id: number) {
  if (!confirm("Delete this entry permanently?")) return;
  void guarded(async () => {
    await cms.del(`guestbook/${id}`);
    await loadGuestbook();
  }, "Deleted");
}

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
  presenceShow.value = data.content.presence?.show ?? [];
  gallery.value = (data.content.gallery ?? []).map((g: GalleryRow, i: number) => ({ ...g, sort: i }));

  // Layout: flatten nav leaves (areas that hold an ordered module list).
  modules.value = ((data.modules ?? []) as ModuleDescriptor[]).filter((m) => isModuleKind(m.kind));
  const leaves: { id: string; label: string; modules: string[] }[] = [];
  const walk = (nodes: NavNode[]) => {
    for (const n of nodes) {
      if (n.modules) leaves.push({ id: n.id, label: pickL(n.label), modules: [...n.modules] });
      if (n.children) walk(n.children);
    }
  };
  walk((data.nav ?? []) as NavNode[]);
  layoutAreas.value = leaves;
  const placed = new Set(leaves.flatMap((l) => l.modules));
  hiddenModules.value = modules.value.map((m) => m.id).filter((id) => !placed.has(id));
  // Default the gallery editor to the first gallery module.
  const firstGallery = modules.value.find((m) => m.kind === MODULE_KIND.gallery);
  if (firstGallery && !modules.value.some((m) => m.id === activeGallery.value && m.kind === MODULE_KIND.gallery)) {
    activeGallery.value = firstGallery.id;
  }
}

/** Pick a localized string for the current editor locale, with fallbacks. */
function pickL(l?: Localized): string {
  return (l && (l[locale.value] ?? l.en ?? Object.values(l)[0])) || "";
}
/** Friendly heading for a module id (falls back to the id). */
function moduleHeading(id: string): string {
  const m = modules.value.find((x) => x.id === id);
  return (m && pickL(m.heading)) || id;
}

// ── layout: reorder, move between areas, hide/show ──────────────────────────
/** The pseudo-area for modules that aren't placed anywhere. */
const HIDDEN_LIST = "hidden";

/** The module ids in one bucket — an area, or the Hidden pile. */
function moduleList(listId: string): string[] | undefined {
  if (listId === HIDDEN_LIST) return hiddenModules.value;
  return layoutAreas.value.find((a) => a.id === listId)?.modules;
}

/** Which bucket holds a module right now, and where in it. */
function findModule(mid: string): { listId: string; index: number } | undefined {
  for (const a of layoutAreas.value) {
    const index = a.modules.indexOf(mid);
    if (index !== -1) return { listId: a.id, index };
  }
  const index = hiddenModules.value.indexOf(mid);
  return index === -1 ? undefined : { listId: HIDDEN_LIST, index };
}

/**
 * The one layout operation: take the module at `fromIdx` in `fromList` and put it
 * at `toIdx` in `toList`. Works within a bucket or across two, including Hidden.
 *
 * Everything that rearranges the layout goes through here — ↑/↓, the area
 * dropdown, and dragging. Not tidiness: the two that already existed each encoded
 * a different, smaller idea of what a move is. `moveModule` *swapped* neighbours,
 * which is indistinguishable from a move only while the distance is 1;
 * `setModuleArea` *appended* to the target, which is a move that ignores where you
 * aimed. A drag is "position X to position Y" and neither one can express it, so
 * dragging on top of them would have meant a third implementation and three ways
 * to disagree about the same list.
 */
function moveModuleTo(fromList: string, fromIdx: number, toList: string, toIdx: number) {
  const from = moduleList(fromList);
  const to = moduleList(toList);
  if (!from || !to) return;
  const [mid] = from.splice(fromIdx, 1);
  if (mid === undefined) return;
  to.splice(Math.max(0, Math.min(toIdx, to.length)), 0, mid);
}

/** ↑/↓. Kept, and not as a fallback: it's the keyboard path, and an admin you
 *  can only operate with a mouse fails the a11y floor. WordPress keeps its
 *  move-up/move-down controls for the same reason, Gutenberg included. */
function moveModule(areaIdx: number, i: number, dir: -1 | 1) {
  const area = layoutAreas.value[areaIdx];
  if (!area) return;
  const j = i + dir;
  if (j < 0 || j >= area.modules.length) return;
  moveModuleTo(area.id, i, area.id, j);
}

/** The area dropdown: still appends to the end of the target, because a
 *  `<select>` names a destination and not a position. */
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

// Reusable asset picker (modal): openPicker(cb) opens the library in pick mode;
// selecting an asset invokes cb with its id, and with the asset itself for the
// callers that need more than the reference (the blog editor wants `alt`).
// Callbacks may take just the id — fewer parameters is always assignable.
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
 * Move an image within the active gallery, and persist the whole order.
 *
 * The old version swapped two rows and PUT both, setting `a.sort = j; b.sort = i`
 * — which only holds while the two positions are adjacent *and* `sort` happens to
 * equal the index. Neither survives a drag: moving image 9 to the front changes
 * nine positions, and `sort` drifts from the index as soon as you delete an image
 * and add another (new items take `sort = <length>`, so a delete-then-add makes a
 * duplicate, and `ORDER BY sort, id` then settles it by id).
 *
 * So: reorder the list, send the list. The server renumbers, which normalizes
 * `sort` back to 0..n-1 on every move as a side effect.
 */
function reorderGalleryTo(fromIdx: number, toIdx: number) {
  const items = [...activeGalleryItems.value];
  const [moved] = items.splice(fromIdx, 1);
  if (!moved) return;
  items.splice(Math.max(0, Math.min(toIdx, items.length)), 0, moved);

  // Reflect it locally: keep the rows for other galleries where they are, and
  // rewrite this gallery's in the new order.
  const ids = items.map((g) => g.id);
  items.forEach((g, i) => (g.sort = i));
  const rest = gallery.value.filter((g) => g.module !== activeGallery.value);
  gallery.value = [...rest, ...items];

  void guarded(
    () => cms.reorderGallery(activeGallery.value, ids),
    "Reordered",
  );
}

/** ↑/↓ — the keyboard path, on the same operation dragging uses. */
function moveGallery(i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= activeGalleryItems.value.length) return;
  reorderGalleryTo(i, j);
}

/** Dropping an image at a position in the grid. */
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


async function signIn() {
  setToken(tokenInput.value);
  await boot();
  if (!authed.value) flash("That token was rejected.");
}
function signOut() {
  setToken(null);
  authed.value = false;
}

async function guarded(fn: () => Promise<void>, ok = "Saved") {
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
const saveHobby = (h: any) => guarded(() => cms.put(`hobbies/${h.id}`, strip(h)));
const saveLink = (l: any) => guarded(() => cms.put(`links/${l.id}`, strip(l)));
const saveNow = (n: any) => guarded(() => cms.put(`now/${n.id}`, strip(n)));

// Deletes
const delItem = (arr: any[], i: number, kind: string) =>
  guarded(async () => {
    const item = arr[i];
    if (item?.id) await cms.del(`${kind}/${item.id}`);
    arr.splice(i, 1);
  }, "Deleted");

/** Move an item up/down in a sortable list and persist the new order. */
function move(arr: any[], i: number, dir: -1 | 1, kind: string) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  const a = arr[i];
  const b = arr[j];
  arr[i] = b;
  arr[j] = a;
  arr[i].sort = i;
  arr[j].sort = j;
  void guarded(async () => {
    await cms.put(`${kind}/${arr[i].id}`, strip(arr[i]));
    await cms.put(`${kind}/${arr[j].id}`, strip(arr[j]));
  }, "Reordered");
}

// Adders
// Seed a unique id per new row. A fixed default like "new-link" would collide on
// the primary key if two rows are added before renaming (applies to hobbies/
// links/now alike); the timestamp suffix keeps each new row distinct.
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;
const addHobby = () =>
  hobbies.value.push({ id: newId("hobby"), title: emptyL(), blurb: emptyL(), tone: DEFAULT_TONE, sort: hobbies.value.length });
const addLink = () =>
  links.value.push({ id: newId("link"), label: emptyL(), href: "", sort: links.value.length });
const addNow = () =>
  now.value.push({ id: newId("now"), key: emptyL(), value: emptyL(), sort: now.value.length });
const addBio = () => bio.value.push(emptyL());
// A bio paragraph is an "image block" when its (locale-independent) value is an asset ref.
function bioImageRef(p: Localized): string {
  const v = (p.en ?? "").trim();
  return parseAssetRef(v) ? v : "";
}

/** Drop empty `de` keys so we don't persist blank translations. */
function strip<T>(obj: T): T {
  const clone = JSON.parse(JSON.stringify(obj));
  const walk = (o: any) => {
    if (o && typeof o === "object") {
      if ("en" in o && "de" in o && !o.de) delete o.de;
      for (const k of Object.keys(o)) walk(o[k]);
    }
  };
  walk(clone);
  return clone;
}


// Analytics
type MetricKey = "pageviews" | "sections" | "clicks" | "visitLength";
const METRIC_LABELS: Record<MetricKey, string> = {
  pageviews: "Page views",
  sections: "Section views",
  clicks: "Clicks",
  visitLength: "Visit length",
};
const metricKeys = Object.keys(METRIC_LABELS) as MetricKey[];
// Both lists come from core: the server switches on the same CLEAR_RANGES ids and
// derives each window from the same `hours`. They were two hand-written tables —
// this one saying "3d" means 72, the route saying `back(72)` for "3d" — for an
// action with no undo.
const RANGES = VIEW_RANGES;
const CLEARS = CLEAR_RANGES;
// Chart palette lives in tokens.css (--stack-1..7); referenced as CSS variables
// so the theme owns the colours and the chart carries no hard-coded hex. Used as
// both an SVG `fill` and a CSS `background`, both of which accept var().
const STACK_COLORS = [
  "var(--stack-1)",
  "var(--stack-2)",
  "var(--stack-3)",
  "var(--stack-4)",
  "var(--stack-5)",
  "var(--stack-6)",
  "var(--stack-7)",
];

const rangeHours = ref(72);
const metric = ref<MetricKey>("pageviews");
const loadingA = ref(false);
const clearing = ref(false);

/**
 * How often the open analytics panel refreshes itself.
 *
 * The numbers move on two clocks: the beacon writes as visitors browse, and the
 * log ingest lands every 5 minutes (ADR 0013). 30s is under both, so the panel
 * reads as live without asking anything of the server that a page reload wasn't
 * already asking — which is what you had to do to see a new number.
 */
const ANALYTICS_POLL_MS = 30_000;
let analyticsPoll: ReturnType<typeof setInterval> | undefined;

/**
 * Load the analytics aggregates. A *read*, so deliberately not via `guarded()`:
 * that bumps `previewKey` on success, which is right for a save ("any successful
 * save invalidates the preview") and wrong here — it reloads the preview iframe
 * for a query that changed nothing. Polling through it would have re-rendered the
 * site every 30 seconds in a hidden dock.
 *
 * `quiet` is for the poll: no spinner and no toast, because a refresh you didn't
 * ask for shouldn't flash "updating…" at you twice a minute or shout when the
 * wifi blips. It still surfaces an expired session, because a poll that 401s
 * every 30s forever is worse than saying so once.
 */
async function loadAnalytics(opts: { quiet?: boolean } = {}) {
  if (!opts.quiet) loadingA.value = true;
  try {
    analytics.value = await cms.analytics(rangeHours.value);
    analyticsAt.value = Date.now();
  } catch (e) {
    if (e instanceof AuthError) {
      authed.value = false;
      stopAnalyticsPoll();
      flash("Session expired — sign in again.");
    } else if (!opts.quiet) {
      flash((e as Error).message || "Couldn't load analytics.");
    }
  } finally {
    loadingA.value = false;
  }
}

/** When the numbers on screen were fetched. Drives the "updated Ns ago" line —
 *  a dashboard that can't say how old it is has the site's own worst bug. */
const analyticsAt = ref(0);

function stopAnalyticsPoll() {
  if (analyticsPoll !== undefined) clearInterval(analyticsPoll);
  analyticsPoll = undefined;
}

/** Poll only while the panel is open *and* the tab is in front. A backgrounded
 *  admin tab polling all afternoon is a request every 30s to look at nothing. */
function syncAnalyticsPoll() {
  const wanted =
    tab.value === "analytics" && typeof document !== "undefined" && !document.hidden;
  if (!wanted) return stopAnalyticsPoll();
  if (analyticsPoll !== undefined) return; // already running
  analyticsPoll = setInterval(() => void loadAnalytics({ quiet: true }), ANALYTICS_POLL_MS);
}

/** Coming back to the tab: refresh now rather than waiting out the interval —
 *  the whole point is that what's on screen is current. */
function onVisibility() {
  if (typeof document === "undefined") return;
  if (!document.hidden && tab.value === "analytics") void loadAnalytics({ quiet: true });
  syncAnalyticsPoll();
}

/** The manual one. Restarts the interval so an explicit refresh buys a full
 *  period rather than a poll landing a second later. */
function refreshAnalytics() {
  stopAnalyticsPoll();
  void loadAnalytics().then(syncAnalyticsPoll);
}

function setRange(h: number) {
  rangeHours.value = h;
  refreshAnalytics();
}
async function clearRange(range: ClearRangeId, label: string) {
  if (!confirm(`Delete analytics for ${label}? This can't be undone.`)) return;
  clearing.value = true;
  await guarded(async () => {
    await cms.clearAnalytics(range);
    await loadAnalytics();
  }, "");
  clearing.value = false;
}

/** Enumerate the continuous bucket axis for the current range + unit. */
function axisBuckets(from: string, to: string, unit: "hour" | "day"): string[] {
  const out: string[] = [];
  if (unit === "hour") {
    const d = new Date(`${from}:00:00Z`);
    const end = new Date(`${to}:00:00Z`);
    while (d <= end) {
      out.push(d.toISOString().slice(0, 13));
      d.setUTCHours(d.getUTCHours() + 1);
    }
  } else {
    const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${to.slice(0, 10)}T00:00:00Z`);
    while (d <= end) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return out;
}

/** Round up to a "nice" number (1/2/5 × 10ⁿ) for an axis top. */
function niceCeil(v: number): number {
	if (v <= 1) return 1;
	const exp = Math.floor(Math.log10(v));
	const base = 10 ** exp;
	const f = v / base;
	const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
	return nf * base;
}
/** A "nice" step dividing `range` into roughly `count` intervals. */
function niceStep(range: number, count: number): number {
	const raw = range / Math.max(1, count);
	const exp = Math.floor(Math.log10(raw));
	const base = 10 ** exp;
	const f = raw / base;
	const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
	return nf * base;
}
/** Integer y-axis ticks 0..top for count data (min step 1, ~4 divisions). */
function yAxisTicks(max: number): { top: number; ticks: number[] } {
	const step = Math.max(1, Math.round(niceStep(niceCeil(max), 4)));
	const top = Math.max(step, Math.ceil(max / step) * step);
	const ticks: number[] = [];
	for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
	return { top, ticks };
}

const metricTotals = computed<Record<MetricKey, number>>(() => {
  const c = analytics.value?.chart;
  const sum = (a?: { count: number }[]) => (a ?? []).reduce((s, r) => s + r.count, 0);
  return { pageviews: sum(c?.pageviews), sections: sum(c?.sections), clicks: sum(c?.clicks), visitLength: sum(c?.visitLength) };
});

/** Stacked-area geometry for the selected metric (composition over time). */
const chart = computed(() => {
  const a = analytics.value;
  if (!a?.chart) return null;
  const rows: { bucket: string; key: string; count: number }[] = a.chart[metric.value] ?? [];
  const unit: "hour" | "day" = a.chart.unit;
  const buckets = axisBuckets(a.range.from, a.range.to, unit);
  const idx = new Map(buckets.map((b, i) => [b, i]));

  // keys ordered by total desc, capped to 6 (+ "other")
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.key, (totals.get(r.key) ?? 0) + r.count);
  let keys = [...totals.entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]);
  const overflow = keys.slice(6);
  keys = keys.slice(0, 6);
  const remap = (k: string) => (overflow.includes(k) ? "other" : k);
  if (overflow.length) keys.push("other");

  // matrix[keyIndex][bucketIndex]
  const matrix = keys.map(() => new Array(buckets.length).fill(0));
  for (const r of rows) {
    const bi = idx.get(r.bucket);
    if (bi == null) continue;
    const ki = keys.indexOf(remap(r.key));
    if (ki >= 0) matrix[ki][bi] += r.count;
  }

  const colTotals = buckets.map((_, bi) => keys.reduce((s, _k, ki) => s + matrix[ki][bi], 0));
  const max = Math.max(1, ...colTotals);

  // Plot box with margins so the axes have room for labels: the left gutter holds
  // the y (count) scale, the bottom gutter the x (time) ticks. yAt scales to a
  // rounded axis top rather than the raw max, so the gridline labels read cleanly.
  const W = 720;
  const H = 210;
  const M = { l: 38, r: 12, t: 12, b: 34 };
  const x0 = M.l;
  const x1 = W - M.r;
  const y0 = M.t;
  const y1 = H - M.b;
  const n = buckets.length;
  const { top: yTop, ticks: yTickVals } = yAxisTicks(max);
  const xAt = (i: number) => (n <= 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0));
  const yAt = (v: number) => y1 - (v / yTop) * (y1 - y0);

  // Build stacked layer paths (bottom-up).
  const cum = new Array(buckets.length).fill(0);
  const layers = keys.map((key, ki) => {
    const lower = cum.slice();
    for (let bi = 0; bi < buckets.length; bi++) cum[bi] += matrix[ki][bi];
    const top = cum.map((v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
    const bottom = lower
      .map((_, i) => `L${xAt(buckets.length - 1 - i).toFixed(1)} ${yAt(lower[buckets.length - 1 - i]).toFixed(1)}`)
      .join(" ");
    return {
      key,
      color: STACK_COLORS[ki % STACK_COLORS.length],
      total: matrix[ki].reduce((s: number, v: number) => s + v, 0),
      path: `${top} ${bottom} Z`,
    };
  });

  const total = colTotals.reduce((s, v) => s + v, 0);
  const labelFmt = (b: string) => (unit === "hour" ? `${b.slice(5, 10)} ${b.slice(11)}h` : b.slice(5));

  // Y ticks: value + pixel row + label (for gridlines and the count scale).
  const yTicks = yTickVals.map((v) => ({ v, y: +yAt(v).toFixed(1), label: String(v) }));
  // X ticks: a readable subset (~6) across the buckets, first & last always shown.
  // Edge ticks anchor start/end so their labels stay inside the viewBox.
  const targetX = Math.min(n, 6);
  const stepX = Math.max(1, Math.round((n - 1) / Math.max(1, targetX - 1)));
  const xTicks: { x: number; label: string; anchor: "start" | "middle" | "end" }[] = [];
  for (let i = 0; i < n; i += stepX)
    xTicks.push({ x: +xAt(i).toFixed(1), label: labelFmt(buckets[i]!), anchor: "middle" });
  if (n > 1 && (n - 1) % stepX !== 0)
    xTicks.push({ x: +xAt(n - 1).toFixed(1), label: labelFmt(buckets[n - 1]!), anchor: "middle" });
  if (xTicks.length) {
    xTicks[0]!.anchor = "start";
    xTicks[xTicks.length - 1]!.anchor = "end";
  }

  return {
    W,
    H,
    x0,
    x1,
    y0,
    y1,
    layers,
    max,
    total,
    unit,
    yTicks,
    xTicks,
    fromLabel: labelFmt(buckets[0] ?? a.range.from),
    toLabel: labelFmt(buckets[n - 1] ?? a.range.to),
  };
});

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
  if (v === "preview") previewKey.value++; // always show the freshest render
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
};
const previewArea = ref<AreaId>(AREA.home);
const previewKey = ref(0);
const showDock = ref(false); // side-by-side live preview while editing

// ── the editor canvas ───────────────────────────────────────────────────────
/**
 * Which panel edits a module's content.
 *
 * `Record<ModuleKind, …>` on purpose: clicking a module on the canvas has to land
 * somewhere for *every* kind, so a new kind shouldn't compile until it says where.
 * `null` is a real answer — a hero's copy is the Home panel's, but `activity` and
 * `coding` render synced data that nothing in the CMS edits, and pretending
 * otherwise would send you to a panel with nothing on it.
 */
const PANEL_FOR_KIND: Record<ModuleKind, View | null> = {
  hero: "home",
  featured: null, // derived from GitHub
  glance: null, // derived from GitHub + Wakapi
  activity: null, // synced
  coding: null, // synced
  projects: null, // synced
  hobbies: "hobbies",
  now: "now",
  guestbook: "guestbook",
  gallery: "gallery",
  presence: "presence",
  bio: "about",
  contact: "links",
  posts: "posts",
};

/** The pending layout, as the preview endpoint wants it. */
const layoutOrder = () => layoutAreas.value.map((a) => ({ area: a.id, modules: a.modules }));

/** What the canvas is rendering: the site resolved with the *pending* order. */
const canvasSite = ref<SiteView | null>(null);
const canvasSelected = ref<string | undefined>();
const canvasLoading = ref(false);
/** Set when the canvas iframe reports it has mounted (see canvas-protocol). */
const canvasReady = ref(false);

/**
 * Re-resolve the pending layout for the canvas.
 *
 * Server-side, because the canvas renders real sections and real sections need a
 * real `SiteView` — live GitHub/Steam data, the asset lookup, freshness. Resolving
 * it here would mean shipping the resolver's whole input set to the browser.
 * Nothing is saved; `/api/cms/preview` writes nothing.
 */
async function refreshCanvas() {
  if (!authed.value) return;
  canvasLoading.value = true;
  try {
    canvasSite.value = (await cms.preview(layoutOrder(), locale.value)) as SiteView;
  } catch (e) {
    if (e instanceof AuthError) authed.value = false;
    else flash((e as Error).message || "Couldn't render the preview.");
  } finally {
    canvasLoading.value = false;
  }
}

/** A module was dragged on the canvas — same primitive as the list and the buttons. */
function canvasMove(area: string, oldIndex: number, newIndex: number) {
  moveModuleTo(area, oldIndex, area, newIndex);
  void refreshCanvas();
}

/** A module was clicked on the canvas: open the panel that edits it. */
function canvasSelect(moduleId: string) {
  canvasSelected.value = moduleId;
  const kind = modules.value.find((m) => m.id === moduleId)?.kind;
  const panel = kind ? PANEL_FOR_KIND[kind] : null;
  if (panel) pick(panel);
  else flash("That module renders synced data — there's nothing to edit by hand.");
}

/** The `+` between two modules: park the insertion point, offer what's unplaced. */
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
  void refreshCanvas();
}

/** How wide the canvas renders. The iframe is its own viewport, so this is a real
 *  responsive check and not a scaled picture of one. */
const canvasWidth = ref("100%");
const canvasFrame = ref<HTMLIFrameElement | null>(null);

/** Push the current pending state into the canvas. */
function postCanvas() {
  const frame = canvasFrame.value?.contentWindow;
  if (!frame || !canvasSite.value || !canvasReady.value) return;
  const message: ToCanvas = {
    type: "canvas:render",
    site: canvasSite.value,
    area: previewArea.value,
    editing: true,
    ...(canvasSelected.value ? { selected: canvasSelected.value } : {}),
  };
  frame.postMessage(message, window.location.origin);
}

/**
 * The canvas talking back.
 *
 * Origin-checked and shape-checked: a message from a framed document is as
 * untrusted as anything off the network, and this handler calls the same
 * mutations the UI does. `isFromCanvas` is a predicate rather than a cast for the
 * same reason the hash is — it's a string a stranger could send.
 */
function onCanvasMessage(event: MessageEvent) {
  if (!isSameOrigin(event) || !isFromCanvas(event.data)) return;
  const msg = event.data;
  if (msg.type === "canvas:ready") {
    canvasReady.value = true;
    postCanvas();
  } else if (msg.type === "canvas:move") {
    canvasMove(msg.area, msg.oldIndex, msg.newIndex);
  } else if (msg.type === "canvas:select") {
    canvasSelect(msg.moduleId);
  } else if (msg.type === "canvas:insert") {
    canvasInsert(msg.area, msg.index);
  }
}

// Any change to the pending layout, the page being viewed, or the selection is a
// re-render. `canvasSite` is set by refreshCanvas(); this just ships it.
watch([canvasSite, previewArea, canvasSelected, canvasReady], postCanvas);
// Opening the editor, or changing the page, needs a fresh resolve.
watch([tab, previewArea, locale], () => {
  if (tab.value === "editor") void refreshCanvas();
});


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
  { label: "Modules", n: modules.value.length, to: "layout" },
]);

// Start/stop the analytics poll as the panel opens and closes. A watcher rather
// than a hook inside AnalyticsPanel, because the panel is `v-show` — it stays
// mounted once rendered, so mount/unmount say nothing about whether you can see it.
watch(tab, syncAnalyticsPoll);

onMounted(() => {
  // Restore before boot: the gate may render first, but the panel behind it is
  // already the one the URL names, so signing in lands where you left off.
  pick(viewFromHash(), false);
  window.addEventListener("hashchange", onHashChange);
  window.addEventListener("message", onCanvasMessage);
  document.addEventListener("visibilitychange", onVisibility);
  void boot();
});
onUnmounted(() => {
  window.removeEventListener("hashchange", onHashChange);
  window.removeEventListener("message", onCanvasMessage);
  document.removeEventListener("visibilitychange", onVisibility);
  stopAnalyticsPoll();
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
    presenceShow,
    togglePresence,
    savePresence,
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
    canvasReady,
    refreshCanvas,
    canvasMove,
    canvasSelect,
    canvasInsert,
    insertAt,
    insertModule,
    layoutOrder,
    canvasWidth,
    canvasFrame,
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
    saveHobby,
    saveLink,
    saveNow,
    delItem,
    move,
    newId,
    addHobby,
    addLink,
    addNow,
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
