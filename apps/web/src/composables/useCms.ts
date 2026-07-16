import type { Hobby, Link, Localized, NavNode, NowItem } from "@lg/core";
import { computed, onMounted, reactive, ref } from "vue";
import { AuthError, cms, loadToken, setToken } from "../lib/cms";

export interface GalleryRow { id: string; module: string; asset: string; caption: Localized; sort?: number }

export interface ModEntry {
  id: number;
  name: string;
  message: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  flags: string[];
  score: number;
}

/**
 * All CMS editor state + behaviour, lifted out of CmsApp.vue so the component
 * is view-only. Owns the loaded content model, the save/delete/reorder handlers,
 * the asset-picker modal, analytics, and the live-preview wiring.
 */
export function useCms() {

type View =
  | "dashboard"
  | "site"
  | "home"
  | "about"
  | "hobbies"
  | "links"
  | "now"
  | "layout"
  | "posts"
  | "gallery"
  | "library"
  | "presence"
  | "guestbook"
  | "analytics"
  | "preview";

// Grouped left-nav, so it's obvious what each screen edits (a small WP/Typo3 shape).
const NAV_GROUPS: { label: string; items: { id: View; label: string }[] }[] = [
  { label: "", items: [{ id: "dashboard", label: "Dashboard" }] },
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
  layout: "Layout — module order",
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
const tab = ref<View>("dashboard");
const locale = ref<"en" | "de">("en");
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

const modules = ref<{ id: string; kind?: string; heading?: Localized }[]>([]);
const layoutAreas = ref<{ id: string; label: string; modules: string[] }[]>([]);
const hiddenModules = ref<string[]>([]);
const gallery = ref<GalleryRow[]>([]);
const activeGallery = ref<string>("gallery");

// Presence widget category allow-list (CMS-owned curation).
const PRESENCE_OPTIONS: { key: string; label: string; hint: string }[] = [
  { key: "game", label: "Games", hint: "Discord 'Playing …'" },
  { key: "streaming", label: "Streaming", hint: "going live" },
  { key: "music", label: "Music", hint: "Spotify" },
  { key: "watching", label: "Watching", hint: "e.g. YouTube" },
  { key: "custom", label: "Custom status", hint: "your set status + emoji" },
  { key: "steam", label: "Steam", hint: "recently-played section" },
];
const presenceShow = ref<string[]>([]);
function togglePresence(key: string) {
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
function lv(obj: Localized, l: "en" | "de") {
  return obj[l] ?? "";
}
function setLv(obj: Localized, l: "en" | "de", val: string) {
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
  modules.value = data.modules ?? [];
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
  const firstGallery = modules.value.find((m) => m.kind === "gallery");
  if (firstGallery && !modules.value.some((m) => m.id === activeGallery.value && m.kind === "gallery")) {
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
function moveModule(areaIdx: number, i: number, dir: -1 | 1) {
  const mods = layoutAreas.value[areaIdx]!.modules;
  const j = i + dir;
  if (j < 0 || j >= mods.length) return;
  [mods[i], mods[j]] = [mods[j]!, mods[i]!];
}
/** Move a module to another area, or to "hidden" (unplaced). */
function setModuleArea(mid: string, target: string) {
  for (const a of layoutAreas.value) a.modules = a.modules.filter((m) => m !== mid);
  hiddenModules.value = hiddenModules.value.filter((m) => m !== mid);
  if (target === "hidden") hiddenModules.value.push(mid);
  else layoutAreas.value.find((a) => a.id === target)?.modules.push(mid);
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
const galleryModules = computed(() => modules.value.filter((m) => m.kind === "gallery"));
const activeGalleryItems = computed(() =>
  gallery.value.filter((g) => g.module === activeGallery.value),
);
function addGalleryAsset(assetId: string, target = activeGallery.value) {
  const ref = `asset:${assetId}`;
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
// selecting an asset invokes cb with its id.
const pickerOpen = ref(false);
const pickerOnly = ref("");
let pickerCb: ((id: string) => void) | null = null;
function openPicker(cb: (id: string) => void, only = "") {
  pickerCb = cb;
  pickerOnly.value = only;
  pickerOpen.value = true;
}
function onPick(asset: { id: string }) {
  const cb = pickerCb;
  pickerCb = null;
  pickerOpen.value = false;
  cb?.(asset.id);
}
function closePicker() {
  pickerCb = null;
  pickerOpen.value = false;
}
const assetIdOf = (ref: string) => ref.replace(/^asset:/, "");
const galleryThumb = (ref: string) => cms.assetUrl(assetIdOf(ref), "w320.webp");
function removeGalleryItem(id: string) {
  gallery.value = gallery.value.filter((g) => g.id !== id);
  void guarded(() => cms.del(`gallery/${id}`), "Removed");
}
function moveGallery(i: number, dir: -1 | 1) {
  // Reorder within the active gallery only.
  const items = activeGalleryItems.value;
  const j = i + dir;
  if (j < 0 || j >= items.length) return;
  const a = items[i]!;
  const b = items[j]!;
  const ai = gallery.value.indexOf(a);
  const bi = gallery.value.indexOf(b);
  gallery.value[ai] = b;
  gallery.value[bi] = a;
  a.sort = j;
  b.sort = i;
  void guarded(async () => {
    await cms.put(`gallery/${a.id}`, strip(a));
    await cms.put(`gallery/${b.id}`, strip(b));
  }, "Reordered");
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
  hobbies.value.push({ id: newId("hobby"), title: emptyL(), blurb: emptyL(), tone: "purple", sort: hobbies.value.length });
const addLink = () =>
  links.value.push({ id: newId("link"), label: emptyL(), href: "", sort: links.value.length });
const addNow = () =>
  now.value.push({ id: newId("now"), key: emptyL(), value: emptyL(), sort: now.value.length });
const addBio = () => bio.value.push(emptyL());
// A bio paragraph is an "image block" when its (locale-independent) value is an asset ref.
function bioImageRef(p: Localized): string {
  const v = (p.en ?? "").trim();
  return /^asset:[A-Za-z0-9_-]+$/.test(v) ? v : "";
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
// [label, hours]
const RANGES: [string, number][] = [
  ["24h", 24],
  ["3d", 72],
  ["7d", 168],
  ["30d", 720],
];
const CLEARS: [string, string][] = [
  ["last hour", "hour"],
  ["24h", "24h"],
  ["3d", "3d"],
  ["7d", "7d"],
  ["everything", "all"],
];
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

async function loadAnalytics() {
  loadingA.value = true;
  await guarded(async () => {
    analytics.value = await cms.analytics(rangeHours.value);
  }, "");
  loadingA.value = false;
}
function setRange(h: number) {
  rangeHours.value = h;
  void loadAnalytics();
}
async function clearRange(range: string, label: string) {
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

function pick(v: View) {
  tab.value = v;
  if ((v === "guestbook" || v === "dashboard") && !guestbook.value) void loadGuestbook();
  if (v === "analytics" && !analytics.value) void loadAnalytics();
  if (AREA_FOR_VIEW[v]) previewArea.value = AREA_FOR_VIEW[v]!; // remember what to preview
  if (v === "preview") previewKey.value++; // always show the freshest render
}

// Live preview: an iframe of the actual site, aimed at the area you're editing.
// Content screens map to the site area that renders them, so the preview shows
// "what you're working on", not the whole page. Saves bump the key to reload.
const AREA_FOR_VIEW: Partial<Record<View, string>> = {
  site: "home",
  home: "home",
  about: "about",
  links: "about",
  hobbies: "life",
  now: "life",
  gallery: "life",
  presence: "life",
};
const previewArea = ref<string>("home");
const previewKey = ref(0);
const showDock = ref(false); // side-by-side live preview while editing
const previewSrc = computed(() => `/?preview=1#${encodeURIComponent(previewArea.value)}`);
function areaLabel(id: string): string {
  return layoutAreas.value.find((a) => a.id === id)?.label ?? id;
}
function viewSite() {
  window.open(`/#${encodeURIComponent(previewArea.value)}`, "_blank", "noopener");
}

// Dashboard: quick counts + jump-in links (WP-style landing).
const dashStats = computed<{ label: string; n: number; to: View }[]>(() => [
  { label: "Hobbies", n: hobbies.value.length, to: "hobbies" },
  { label: "Links", n: links.value.length, to: "links" },
  { label: "Right-now items", n: now.value.length, to: "now" },
  { label: "Gallery images", n: gallery.value.length, to: "gallery" },
  { label: "Modules", n: modules.value.length, to: "layout" },
]);

onMounted(boot);

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
    setModuleArea,
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
