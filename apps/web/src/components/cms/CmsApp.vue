<script setup lang="ts">
import type { Hobby, Link, Localized, NavNode, NowItem } from "@lg/core";
import { computed, onMounted, reactive, ref } from "vue";
import { AuthError, cms, loadToken, setToken } from "../../lib/cms";

type View =
  | "dashboard"
  | "site"
  | "home"
  | "about"
  | "hobbies"
  | "links"
  | "now"
  | "layout"
  | "gallery"
  | "media"
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
      { id: "gallery", label: "Gallery" },
      { id: "media", label: "Media" },
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
  gallery: "Gallery",
  media: "Media library",
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
const media = ref<string[]>([]);
const analytics = ref<any>(null);

// Layout (module order per area) + gallery images.
interface GalleryRow { id: string; module: string; src: string; caption: Localized; alt?: string; sort?: number }
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
interface ModEntry {
  id: number;
  name: string;
  message: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  flags: string[];
  score: number;
}
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
    // Warm the dashboard's counts/badge (both are cheap, cached after).
    void loadMedia();
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
function addToGallery(path: string, target = activeGallery.value) {
  if (gallery.value.some((g) => g.src === path && g.module === target)) {
    flash("Already in this gallery.");
    return;
  }
  const item: GalleryRow = {
    id: newId("img"),
    module: target,
    src: path,
    caption: emptyL(),
    sort: gallery.value.filter((g) => g.module === target).length,
  };
  gallery.value.push(item);
  void guarded(() => cms.put(`gallery/${item.id}`, strip(item)), "Added to gallery");
}
const saveGalleryItem = (g: GalleryRow) => guarded(() => cms.put(`gallery/${g.id}`, strip(g)));
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
  if (!confirm("Delete this gallery and all its image placements? (Media files stay.)")) return;
  void guarded(async () => {
    await cms.deleteGallery(id);
    await loadAll();
  }, "Gallery deleted");
}

// ── media: delete an upload ─────────────────────────────────────────────────
function removeMedia(path: string) {
  if (!confirm("Delete this image? It will disappear from anywhere it's used.")) return;
  media.value = media.value.filter((m) => m !== path);
  gallery.value = gallery.value.filter((g) => g.src !== path);
  void guarded(() => cms.deleteMedia(path), "Deleted");
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

// Media
const uploading = ref(false);
async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  await guarded(async () => {
    await cms.upload(file);
    media.value = (await cms.listMedia()).files;
  }, "Uploaded");
  uploading.value = false;
  input.value = "";
}
async function loadMedia() {
  await guarded(async () => {
    media.value = (await cms.listMedia()).files;
  }, "");
}
function copy(text: string) {
  navigator.clipboard?.writeText(cms.mediaUrl(text));
  flash("URL copied");
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
const STACK_COLORS = ["#8b5cf6", "#6d48e5", "#a78bfa", "#22d3ee", "#f59e0b", "#f472b6", "#94a3b8"];

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
  const W = 720;
  const H = 170;
  const PAD = 8;
  const n = buckets.length;
  const xAt = (i: number) => (n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD));
  const yAt = (v: number) => H - 6 - (v / max) * (H - 26);

  // Build stacked layer paths (bottom-up).
  const cum = new Array(buckets.length).fill(0);
  const layers = keys.map((key, ki) => {
    const lower = cum.slice();
    for (let bi = 0; bi < buckets.length; bi++) cum[bi] += matrix[ki][bi];
    const top = cum.map((v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
    const bottom = lower
      .map((v, i) => `L${xAt(buckets.length - 1 - i).toFixed(1)} ${yAt(lower[buckets.length - 1 - i]).toFixed(1)}`)
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
  return {
    W,
    H,
    layers,
    max,
    total,
    unit,
    fromLabel: labelFmt(buckets[0] ?? a.range.from),
    toLabel: labelFmt(buckets[n - 1] ?? a.range.to),
  };
});

function pick(v: View) {
  tab.value = v;
  if ((v === "media" || v === "dashboard") && media.value.length === 0) void loadMedia();
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
  { label: "Media files", n: media.value.length, to: "media" },
  { label: "Modules", n: modules.value.length, to: "layout" },
]);

onMounted(boot);
</script>

<template>
  <div class="cms" :class="{ wide: showDock && authed && tab !== 'preview' }">
    <div v-if="loading" class="center muted">Loading…</div>

    <!-- LOGIN GATE -->
    <div v-else-if="!authed" class="gate">
      <h1>CMS</h1>
      <p class="muted">Sign in to edit letsgaming.de.</p>
      <a class="btn primary" :href="cms.loginUrl()">Sign in with GitHub</a>
      <div class="or">or paste a CMS token</div>
      <input v-model="tokenInput" type="password" placeholder="CMS_TOKEN" @keyup.enter="signIn" />
      <button class="btn" @click="signIn">Use token</button>
    </div>

    <!-- APP -->
    <div v-else class="shell">
      <aside class="side">
        <div class="brand">CMS</div>
        <nav class="nav">
          <div v-for="(g, gi) in NAV_GROUPS" :key="gi" class="navgroup">
            <div v-if="g.label" class="navlabel">{{ g.label }}</div>
            <button
              v-for="item in g.items"
              :key="item.id"
              :class="{ on: tab === item.id }"
              @click="pick(item.id)"
            >
              {{ item.label }}
              <span v-if="item.id === 'guestbook' && guestbook?.pending" class="ndot">{{ guestbook.pending }}</span>
            </button>
          </div>
        </nav>
        <div class="sidefoot">
          <select v-model="locale" title="Editing locale">
            <option value="en">EN</option>
            <option value="de">DE</option>
          </select>
          <span class="muted">{{ login }}</span>
          <button class="link" @click="signOut">sign out</button>
        </div>
      </aside>

      <main class="main">
        <div class="topbar">
          <h2>{{ VIEW_TITLES[tab] }}</h2>
          <div class="topact">
            <button v-if="tab !== 'preview'" class="link" @click="showDock = !showDock">
              {{ showDock ? "Hide preview" : "Show preview" }}
            </button>
            <button class="btn ghost" @click="viewSite">View site ↗</button>
          </div>
        </div>

        <div class="worksplit">
          <div class="editor">

        <!-- DASHBOARD -->
        <section v-show="tab === 'dashboard'" class="pane">
          <div class="card note">
            Welcome back. This is your site's control room — pick a section on the left. Edits go live
            immediately (no rebuild); use <b>Preview</b> or <b>View site</b> to see them.
          </div>
          <div class="statgrid">
            <button v-for="s in dashStats" :key="s.label" class="stat" @click="pick(s.to)">
              <span class="statn">{{ s.n }}</span>
              <span class="statl">{{ s.label }}</span>
            </button>
          </div>
          <div v-if="guestbook?.pending" class="card">
            <h3>Needs attention</h3>
            <p><b>{{ guestbook.pending }}</b> guestbook {{ guestbook.pending === 1 ? "entry" : "entries" }} awaiting review — <button class="link" @click="pick('guestbook')">moderate now</button>.</p>
          </div>
        </section>

        <!-- SITE IDENTITY -->
        <section v-show="tab === 'site'" class="pane">
          <div class="card">
            <h3>Identity</h3>
            <p class="muted">Your name, handle, and the eyebrow role line. Shown across the site.</p>
            <label>Name<input v-model="meta.name" /></label>
            <label>Handle<input v-model="meta.handle" /></label>
            <label>Location<input :value="lv(meta.location, locale)" @input="setLv(meta.location, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Role<input :value="lv(meta.role, locale)" @input="setLv(meta.role, locale, ($event.target as HTMLInputElement).value)" /></label>
            <button class="btn" @click="saveMeta">Save identity</button>
          </div>
        </section>

        <!-- HOME INTRO -->
        <section v-show="tab === 'home'" class="pane">
          <div class="card note">The hero on the <b>Home</b> area: the big headline, the lede beneath it, and the status line. Projects &amp; activity come from GitHub automatically.</div>
          <div class="card">
            <h3>Headline</h3>
            <label>Before<input :value="lv(headline.before, locale)" @input="setLv(headline.before, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Highlight<input :value="lv(headline.highlight, locale)" @input="setLv(headline.highlight, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>After<input :value="lv(headline.after, locale)" @input="setLv(headline.after, locale, ($event.target as HTMLInputElement).value)" /></label>
            <button class="btn" @click="saveHeadline">Save headline</button>
          </div>
          <div class="card">
            <h3>Lede <span class="muted">(**bold** supported)</span></h3>
            <textarea :value="lv(lede, locale)" @input="setLv(lede, locale, ($event.target as HTMLTextAreaElement).value)" rows="3" />
            <button class="btn" @click="saveLede">Save lede</button>
          </div>
          <div class="card">
            <h3>Status</h3>
            <label>Verb<input :value="lv(status.verb, locale)" @input="setLv(status.verb, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Now<input :value="lv(status.now, locale)" @input="setLv(status.now, locale, ($event.target as HTMLInputElement).value)" /></label>
            <button class="btn" @click="saveStatus">Save status</button>
          </div>
        </section>

        <!-- ABOUT / BIO -->
        <section v-show="tab === 'about'" class="pane">
          <div class="card">
            <h3>Bio <span class="muted">(paragraphs, **bold** supported)</span></h3>
            <div v-for="(p, i) in bio" :key="i" class="row">
              <textarea :value="lv(p, locale)" @input="setLv(p, locale, ($event.target as HTMLTextAreaElement).value)" rows="2" />
              <button class="link danger" @click="bio.splice(i, 1)">remove</button>
            </div>
            <div class="actions"><button class="link" @click="addBio">+ paragraph</button><button class="btn" @click="saveBio">Save bio</button></div>
          </div>
        </section>

        <!-- PRESENCE -->
        <section v-show="tab === 'presence'" class="pane">
          <div class="card">
            <h3>Presence widget <span class="muted">(Life → “Right now-ish”)</span></h3>
            <p class="muted">
              Which Discord/Steam categories the widget may reveal. The server filters to exactly
              these before anything reaches a visitor — unchecked categories never leave the backend.
            </p>
            <div class="pgrid">
              <label v-for="o in PRESENCE_OPTIONS" :key="o.key" class="ptoggle">
                <input type="checkbox" :checked="presenceShow.includes(o.key)" @change="togglePresence(o.key)" />
                <span><b>{{ o.label }}</b><span class="muted"> — {{ o.hint }}</span></span>
              </label>
            </div>
            <div class="actions"><button class="btn" @click="savePresence">Save presence</button></div>
          </div>
        </section>

      <!-- LAYOUT (module order per area) -->
      <section v-show="tab === 'layout'" class="pane">
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

      <!-- HOBBIES -->
      <section v-show="tab === 'hobbies'" class="pane">
        <div v-for="h in hobbies" :key="h.id" class="card">
          <div class="grid2">
            <label>ID<input v-model="h.id" /></label>
            <label>Icon<input v-model="h.icon" placeholder="game / plant / chip / server" /></label>
            <label>Title<input :value="lv(h.title, locale)" @input="setLv(h.title, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Tone
              <select v-model="h.tone"><option>purple</option><option>coral</option><option>mint</option><option>sun</option></select>
            </label>
            <label>Sort<input type="number" v-model.number="h.sort" /></label>
          </div>
          <label>Blurb<input :value="lv(h.blurb, locale)" @input="setLv(h.blurb, locale, ($event.target as HTMLInputElement).value)" /></label>
          <div class="actions">
            <button class="link" title="Move up" @click="move(hobbies, hobbies.indexOf(h), -1, 'hobbies')">↑</button>
            <button class="link" title="Move down" @click="move(hobbies, hobbies.indexOf(h), 1, 'hobbies')">↓</button>
            <button class="link danger" @click="delItem(hobbies, hobbies.indexOf(h), 'hobbies')">delete</button>
            <button class="btn" @click="saveHobby(h)">Save</button>
          </div>
        </div>
        <button class="btn ghost" @click="addHobby">+ Add hobby</button>
      </section>

      <!-- LINKS -->
      <section v-show="tab === 'links'" class="pane">
        <div v-for="l in links" :key="l.id" class="card">
          <div class="grid2">
            <label>ID<input v-model="l.id" /></label>
            <label>Icon<input v-model="l.icon" placeholder="gh, mail, x, linkedin, mastodon, youtube, discord, instagram, bluesky, globe" /></label>
            <label>Label<input :value="lv(l.label, locale)" @input="setLv(l.label, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Href<input v-model="l.href" /></label>
            <label>Sort<input type="number" v-model.number="l.sort" /></label>
          </div>
          <label class="check"><input type="checkbox" v-model="l.primary" /> primary</label>
          <div class="actions">
            <button class="link" title="Move up" @click="move(links, links.indexOf(l), -1, 'links')">↑</button>
            <button class="link" title="Move down" @click="move(links, links.indexOf(l), 1, 'links')">↓</button>
            <button class="link danger" @click="delItem(links, links.indexOf(l), 'links')">delete</button>
            <button class="btn" @click="saveLink(l)">Save</button>
          </div>
        </div>
        <button class="btn ghost" @click="addLink">+ Add link</button>
      </section>

      <!-- NOW -->
      <section v-show="tab === 'now'" class="pane">
        <div v-for="n in now" :key="n.id" class="card">
          <div class="grid2">
            <label>ID<input v-model="n.id" /></label>
            <label>Sort<input type="number" v-model.number="n.sort" /></label>
            <label>Key<input :value="lv(n.key, locale)" @input="setLv(n.key, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Value<input :value="lv(n.value, locale)" @input="setLv(n.value, locale, ($event.target as HTMLInputElement).value)" /></label>
          </div>
          <div class="actions">
            <button class="link" title="Move up" @click="move(now, now.indexOf(n), -1, 'now')">↑</button>
            <button class="link" title="Move down" @click="move(now, now.indexOf(n), 1, 'now')">↓</button>
            <button class="link danger" @click="delItem(now, now.indexOf(n), 'now')">delete</button>
            <button class="btn" @click="saveNow(n)">Save</button>
          </div>
        </div>
        <button class="btn ghost" @click="addNow">+ Add row</button>
      </section>

      <!-- GALLERY (images placed on the site) -->
      <section v-show="tab === 'gallery'" class="pane">
        <div class="card">
          <div class="galhead">
            <label>Gallery
              <select v-model="activeGallery">
                <option v-for="gm in galleryModules" :key="gm.id" :value="gm.id">{{ moduleHeading(gm.id) }} ({{ gm.id }})</option>
              </select>
            </label>
            <span class="galact">
              <button class="btn ghost" @click="createGallery">+ New gallery</button>
              <button v-if="activeGallery !== 'gallery'" class="link danger" @click="deleteGallery(activeGallery)">delete this gallery</button>
            </span>
          </div>
          <p class="muted">
            Images shown on the site. Add them from the <b>Media</b> tab (“+ gallery” adds to the
            gallery selected here). Each gallery is a module — position it via <b>Layout</b>. New
            galleries start hidden until you place them.
          </p>
        </div>
        <div v-if="!activeGalleryItems.length" class="muted">
          This gallery is empty — upload in <b>Media</b>, then hit “+ gallery”.
        </div>
        <div v-for="(g, i) in activeGalleryItems" :key="g.id" class="card gitem">
          <img :src="cms.mediaUrl(g.src)" class="gthumb" loading="lazy" />
          <div class="gbody">
            <label>Caption ({{ locale }})
              <input v-model="g.caption[locale]" maxlength="120" placeholder="optional" @blur="saveGalleryItem(g)" />
            </label>
            <label>Alt text <span class="muted">(screen readers; defaults to caption)</span>
              <input v-model="g.alt" maxlength="200" placeholder="describe the image" @blur="saveGalleryItem(g)" />
            </label>
            <div class="actions">
              <button class="link" :disabled="i === 0" @click="moveGallery(i, -1)">↑ up</button>
              <button class="link" :disabled="i === activeGalleryItems.length - 1" @click="moveGallery(i, 1)">↓ down</button>
              <button class="link danger" @click="removeGalleryItem(g.id)">remove</button>
            </div>
          </div>
        </div>
      </section>

      <!-- MEDIA -->
      <section v-show="tab === 'media'" class="pane">
        <div class="card">
          <h3>Upload image</h3>
          <input type="file" accept="image/*" :disabled="uploading" @change="onUpload" />
          <p class="muted">
            Resized to WebP and stored locally. “+ gallery” places an image into the gallery
            currently selected on the <b>Gallery</b> screen (<b>{{ moduleHeading(activeGallery) }}</b>).
          </p>
        </div>
        <div class="mediagrid">
          <figure v-for="m in media" :key="m">
            <img :src="cms.mediaUrl(m)" loading="lazy" />
            <div class="mactions">
              <button class="link" :disabled="activeGalleryItems.some((g) => g.src === m)" @click="addToGallery(m)">
                {{ activeGalleryItems.some((g) => g.src === m) ? "in gallery" : "+ gallery" }}
              </button>
              <button class="link" @click="copy(m)">copy URL</button>
              <button class="link danger" @click="removeMedia(m)">delete</button>
            </div>
          </figure>
          <p v-if="!media.length" class="muted">No uploads yet.</p>
        </div>
      </section>

      <!-- GUESTBOOK MODERATION -->
      <section v-show="tab === 'guestbook'" class="pane">
        <div class="gb-head">
          <h2>
            Guestbook
            <span v-if="guestbook?.pending" class="pill pill-pending">{{ guestbook.pending }} pending</span>
          </h2>
          <button class="btn ghost" @click="loadGuestbook">Refresh</button>
        </div>
        <p class="muted">
          Nothing is public until you approve it. Auto-flags only sort the queue — you decide.
        </p>
        <div v-if="loadingG" class="muted">Loading…</div>
        <div v-else-if="!guestbook?.entries.length" class="muted">No entries yet.</div>
        <div v-else class="gb-mod">
          <div v-for="e in guestbook.entries" :key="e.id" class="gb-row">
            <div class="gb-body">
              <div class="gb-meta">
                <span class="pill" :class="'pill-' + e.status">{{ e.status }}</span>
                <b>{{ e.name }}</b>
                <span class="muted">{{ new Date(e.createdAt).toLocaleString() }}</span>
                <span v-if="e.flags.length" class="gb-flags" :title="`score ${e.score}`">
                  ⚑ {{ e.flags.join(", ") }}
                </span>
              </div>
              <p class="gb-text">{{ e.message }}</p>
            </div>
            <div class="gb-buttons">
              <button v-if="e.status !== 'approved'" class="btn" @click="moderate(e.id, 'approve')">
                Approve
              </button>
              <button v-if="e.status === 'pending'" class="btn ghost" @click="moderate(e.id, 'reject')">
                Reject
              </button>
              <button class="link danger" @click="removeEntry(e.id)">delete</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ANALYTICS -->
      <section v-show="tab === 'analytics'" class="pane">
        <div v-if="!analytics" class="muted">Loading…</div>
        <template v-else>
          <div class="card chartcard">
            <div class="charthead">
              <div class="seg">
                <button
                  v-for="k in metricKeys"
                  :key="k"
                  :class="{ on: metric === k }"
                  @click="metric = k"
                >
                  <span class="slabel">{{ METRIC_LABELS[k] }}</span>
                  <span class="sval">{{ metricTotals[k] }}</span>
                </button>
              </div>
              <div class="seg ranges">
                <button
                  v-for="[label, h] in RANGES"
                  :key="h"
                  :class="{ on: rangeHours === h }"
                  @click="setRange(h)"
                >
                  {{ label }}
                </button>
              </div>
            </div>
            <svg v-if="chart" class="chart" :viewBox="`0 0 ${chart.W} ${chart.H}`">
              <path v-for="l in chart.layers" :key="l.key" :d="l.path" :fill="l.color" fill-opacity="0.85">
                <title>{{ l.key }}: {{ l.total }}</title>
              </path>
            </svg>
            <p v-if="chart && chart.total === 0" class="muted empty">
              No {{ METRIC_LABELS[metric].toLowerCase() }} recorded in this range yet.
            </p>
            <div v-if="chart && chart.total > 0" class="legend">
              <span v-for="l in chart.layers" :key="l.key" class="lg">
                <i :style="{ background: l.color }" />{{ l.key }} <b>{{ l.total }}</b>
              </span>
            </div>
            <div class="xaxis">
              <span>{{ chart?.fromLabel }}</span>
              <span class="muted">{{ chart?.unit === "hour" ? "hourly" : "daily" }}{{ loadingA ? " · updating…" : "" }}</span>
              <span>{{ chart?.toLabel }}</span>
            </div>
            <div class="clearbar">
              <span class="muted">Clear:</span>
              <button
                v-for="[label, range] in CLEARS"
                :key="range"
                class="clearbtn"
                :class="{ danger: range === 'all' }"
                :disabled="clearing"
                @click="clearRange(range, label)"
              >
                {{ label }}
              </button>
            </div>
          </div>
          <p v-if="analytics && !analytics.paths.length" class="muted" style="margin-top: 4px">
            No traffic stats yet. These come from the reverse-proxy access log — set
            <b>ACCESS_LOG</b> on the server (see <code>.env.example</code>). The cookieless
            engagement stats below don't need it.
          </p>
          <div class="cols">
            <div class="card"><h3>Top paths</h3><ul><li v-for="r in analytics.paths" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
            <div class="card"><h3>Referrers</h3><ul><li v-for="r in analytics.referrers" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
            <div class="card"><h3>Browsers</h3><ul><li v-for="r in analytics.browsers" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
            <div class="card"><h3>OS</h3><ul><li v-for="r in analytics.os" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
            <div class="card"><h3>Devices</h3><ul><li v-for="r in analytics.devices" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
          </div>
          <template v-if="analytics.engagement">
            <h3 style="margin-top: 8px">Engagement <span class="muted">— cookieless, in-page</span></h3>
            <div class="cols">
              <div class="card"><h3>Sections viewed</h3><ul><li v-for="r in analytics.engagement.tabs" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Transitions</h3><ul><li v-for="r in analytics.engagement.transitions" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Exited from</h3><ul><li v-for="r in analytics.engagement.exits" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Dwell / section</h3><ul><li v-for="r in analytics.engagement.dwell" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Scroll depth</h3><ul><li v-for="r in analytics.engagement.scroll" :key="r.key"><span>{{ r.key }}%</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Clicks</h3><ul><li v-for="r in analytics.engagement.clicks" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Projects opened</h3><ul><li v-for="r in analytics.engagement.projects" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Viewport</h3><ul><li v-for="r in analytics.engagement.viewport" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Sections / visit</h3><ul><li v-for="r in analytics.engagement.sessionTabs" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Visit length</h3><ul><li v-for="r in analytics.engagement.sessionDwell" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
              <div class="card"><h3>Theme</h3><ul><li v-for="r in analytics.engagement.theme" :key="r.key"><span>{{ r.key }}</span><b>{{ r.count }}</b></li></ul></div>
            </div>
          </template>
          <p class="muted">Anonymous aggregates only — no cookies, no IPs, nothing personal stored.</p>
        </template>
      </section>

        <!-- PREVIEW -->
        <section v-show="tab === 'preview'" class="pane preview">
          <div class="prevbar">
            <label class="prevpick">Showing
              <select v-model="previewArea">
                <option v-for="a in layoutAreas" :key="a.id" :value="a.id">{{ a.label }}</option>
              </select>
            </label>
            <span class="muted">Reflects everything you've saved — reload after changes.</span>
            <span class="prevact">
              <button class="btn ghost" @click="previewKey++">Reload</button>
              <button class="btn ghost" @click="viewSite">Open in new tab ↗</button>
            </span>
          </div>
          <iframe :key="previewKey + '-' + previewArea" class="prevframe" :src="previewSrc" title="Site preview" />
        </section>
          </div><!-- /.editor -->

          <!-- DOCKED LIVE PREVIEW (side-by-side while editing) -->
          <aside v-if="showDock && tab !== 'preview'" class="dock">
            <div class="dockbar">
              <span class="muted">Live preview · <b>{{ areaLabel(previewArea) }}</b></span>
              <span class="dockact">
                <select v-model="previewArea" title="Area to preview">
                  <option v-for="a in layoutAreas" :key="a.id" :value="a.id">{{ a.label }}</option>
                </select>
                <button class="link" title="Reload" @click="previewKey++">⟳</button>
                <button class="link" title="Open in new tab" @click="viewSite">↗</button>
              </span>
            </div>
            <iframe
              :key="'dock-' + previewKey + '-' + previewArea"
              class="dockframe"
              :src="previewSrc"
              title="Live preview"
            />
          </aside>
        </div><!-- /.worksplit -->
      </main>

      <div v-if="toast" class="toast">{{ toast }}</div>
    </div>
  </div>
</template>

<style scoped>
.cms { max-width: 1120px; margin: 0 auto; padding: 20px 18px 80px; font-family: var(--f-b); color: var(--ink); }
.center { text-align: center; padding: 60px; }
.muted { color: var(--muted); }
h1, h3 { font-family: var(--f-d); color: var(--ink-strong); }
.gate { max-width: 340px; margin: 12vh auto; display: flex; flex-direction: column; gap: 12px; text-align: center; }
.gate .or { margin: 6px 0; font-size: 12px; color: var(--muted); }
.bar { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; flex-wrap: wrap; }
.bar strong { font-family: var(--f-d); font-size: 18px; color: var(--ink-strong); }
.right { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 13px; }

/* WP/Typo3-ish shell: fixed left module menu + main workspace. */
.shell { display: grid; grid-template-columns: 208px minmax(0, 1fr); gap: 24px; align-items: start; }
.side { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 14px; }
.brand { font-family: var(--f-d); font-size: 18px; color: var(--ink-strong); padding: 2px 4px; }
.nav { display: flex; flex-direction: column; gap: 12px; }
.navgroup { display: flex; flex-direction: column; gap: 2px; }
.navlabel { font-family: var(--f-m); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 4px 8px 2px; }
.side .nav button { display: flex; align-items: center; gap: 6px; text-align: left; font-family: var(--f-m); font-size: 13px; padding: 7px 10px; border-radius: 9px; border: none; background: none; color: var(--ink); cursor: pointer; }
.side .nav button:hover { background: var(--purple-wash); }
.side .nav button.on { background: var(--purple); color: #fff; }
.ndot { margin-left: auto; background: var(--coral); color: #fff; font-size: 10px; min-width: 16px; height: 16px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; padding: 0 4px; }
.side .nav button.on .ndot { background: rgba(255,255,255,0.3); }
.sidefoot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; border-top: 1px solid var(--line); padding-top: 12px; }
.main { min-width: 0; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.topbar h2 { font-family: var(--f-d); font-size: 20px; color: var(--ink-strong); }
.topact { display: flex; align-items: center; gap: 10px; }

/* dashboard */
.statgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.stat { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; padding: 16px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; cursor: pointer; }
.stat:hover { border-color: var(--purple-br); }
.statn { font-family: var(--f-d); font-size: 26px; color: var(--ink-strong); }
.statl { font-size: 12px; color: var(--muted); }

/* preview */
.preview { height: calc(100vh - 160px); }
.prevbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.prevpick { display: flex; align-items: center; gap: 6px; font-family: var(--f-m); font-size: 12px; color: var(--muted); }
.prevpick select { font-size: 12px; padding: 4px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--card-2); color: var(--ink); }
.prevact { display: flex; gap: 8px; }
.prevframe { flex: 1; width: 100%; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }

/* Side-by-side editor + live preview */
.cms.wide { max-width: 1500px; }
.worksplit { display: flex; gap: 20px; align-items: flex-start; }
.editor { flex: 1; min-width: 0; }
.dock { flex: 0 0 440px; position: sticky; top: 16px; display: flex; flex-direction: column; height: calc(100vh - 120px); }
.dockbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.dockact { display: flex; align-items: center; gap: 8px; }
.dockact select { font-size: 12px; padding: 3px 6px; border-radius: 8px; border: 1px solid var(--line); background: var(--card-2); color: var(--ink); }
.dockframe { flex: 1; width: 100%; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
@media (max-width: 1080px) {
  .cms.wide { max-width: 1120px; }
  .worksplit { flex-direction: column; }
  .dock { flex-basis: auto; width: 100%; height: 70vh; position: static; }
}

@media (max-width: 720px) {
  .shell { grid-template-columns: 1fr; }
  .side { position: static; }
  .side .nav { flex-direction: row; flex-wrap: wrap; }
}
.pane { display: flex; flex-direction: column; gap: 16px; }
.note { background: var(--purple-wash); border-color: var(--line); font-family: var(--f-m); font-size: 13px; line-height: 1.5; color: var(--ink); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; box-shadow: var(--sh-1); display: flex; flex-direction: column; gap: 10px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); font-family: var(--f-m); }
label.check { flex-direction: row; align-items: center; gap: 8px; }
input, textarea, select { font-family: var(--f-b); font-size: 14px; color: var(--ink); background: var(--card-2); border: 1px solid var(--line); border-radius: 9px; padding: 8px 10px; width: 100%; }
.row { display: flex; gap: 8px; align-items: start; }
.row textarea { flex: 1; }
.actions { display: flex; justify-content: flex-end; gap: 12px; align-items: center; margin-top: 4px; }
.btn { font-family: var(--f-d); font-weight: 600; font-size: 14px; padding: 9px 16px; border-radius: 11px; border: none; background: var(--purple); color: #fff; cursor: pointer; }
.btn.ghost { background: var(--card-2); color: var(--ink); border: 1px solid var(--line); align-self: flex-start; }
.btn.primary { background: var(--purple); }
.link { background: none; border: none; color: var(--purple-br); cursor: pointer; font-family: var(--f-m); font-size: 12px; }
.link.danger { color: var(--coral); }
.modlist { list-style: none; display: flex; flex-direction: column; gap: 4px; }
.modlist li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--card-2); font-size: 14px; }
.modlist .ord { display: flex; gap: 8px; flex: none; align-items: center; }
.modlist .ord select { font-size: 12px; padding: 3px 6px; border-radius: 8px; border: 1px solid var(--line); background: var(--card-2); color: var(--ink); }
.galhead { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.galhead label { display: flex; flex-direction: column; gap: 4px; font-family: var(--f-m); font-size: 12px; color: var(--muted); }
.galact { display: flex; align-items: center; gap: 12px; }
.gitem { flex-direction: row; align-items: center; gap: 14px; }
.gthumb { width: 96px; height: 72px; object-fit: cover; border-radius: 10px; border: 1px solid var(--line); flex: none; }
.gbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.mactions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 6px; }
.mediagrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.mediagrid figure { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 8px; text-align: center; }
.mediagrid img { width: 100%; border-radius: 8px; aspect-ratio: 4/3; object-fit: cover; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.cols ul { list-style: none; padding: 0; margin: 0; }
.cols li { display: flex; justify-content: space-between; padding: 5px 0; border-top: 1px solid var(--line); font-size: 13px; }
.cols li:first-child { border-top: none; }
.chartcard { padding: 14px 16px; }
.charthead { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.seg { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.seg button { font-family: var(--f-m); font-size: 12px; color: var(--muted); background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; cursor: pointer; display: inline-flex; flex-direction: column; gap: 1px; line-height: 1.2; }
.seg.ranges button { flex-direction: row; align-items: center; }
.seg button.on { color: var(--ink-strong); border-color: var(--purple-br); background: var(--purple-wash); }
.seg .slabel { font-size: 11px; }
.seg .sval { font-size: 16px; color: var(--ink); font-family: var(--f-d); }
.seg button.on .sval { color: var(--purple-br); }
.chart { width: 100%; height: auto; display: block; }
.c-area { fill: var(--purple); opacity: 0.14; }
.c-line { fill: none; stroke: var(--purple-br); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.c-dot { fill: var(--purple-br); }
.empty { text-align: center; padding: 8px 0; }
.xaxis { display: flex; justify-content: space-between; font-family: var(--f-m); font-size: 11px; color: var(--muted); margin-top: 4px; }
.legend { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-top: 10px; font-family: var(--f-m); font-size: 12px; color: var(--ink); }
.legend .lg { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.legend b { color: var(--muted); font-weight: 500; }
.clearbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); font-family: var(--f-m); font-size: 12px; }
.clearbtn { font-family: var(--f-m); font-size: 12px; color: var(--muted); background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px; cursor: pointer; }
.clearbtn:hover { color: var(--ink); border-color: var(--purple-br); }
.clearbtn.danger { color: var(--coral); border-color: color-mix(in srgb, var(--coral) 40%, var(--line)); }
.clearbtn:disabled { opacity: 0.5; cursor: default; }
.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--ink-strong); color: var(--bg-base); padding: 10px 18px; border-radius: 10px; font-size: 14px; box-shadow: var(--sh-2); }
.gb-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.gb-head h2 { display: flex; align-items: center; gap: 10px; }
.gb-mod { display: flex; flex-direction: column; gap: 10px; }
.gb-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.gb-body { min-width: 0; flex: 1; }
.gb-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 13px; }
.gb-text { margin-top: 6px; font-size: 14px; color: var(--ink); white-space: pre-wrap; word-break: break-word; }
.gb-flags { font-family: var(--f-m); font-size: 11px; color: var(--coral); }
.gb-buttons { display: flex; align-items: center; gap: 10px; flex: none; }
.gb-buttons .btn { padding: 6px 12px; font-size: 13px; }
.pill { font-family: var(--f-m); font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); text-transform: capitalize; }
.pill-pending { background: var(--purple-wash); color: var(--purple-br); border-color: transparent; }
.pill-approved { background: color-mix(in srgb, var(--mint, #34d399) 20%, transparent); color: var(--ink-strong); }
.pill-rejected { color: var(--muted); }
.pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; margin: 4px 0 12px; }
.ptoggle { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--ink); cursor: pointer; padding: 6px 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--card-2); }
.ptoggle input { width: auto; margin-top: 2px; }
</style>
