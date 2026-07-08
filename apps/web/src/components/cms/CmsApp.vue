<script setup lang="ts">
import type { Hobby, Link, Localized, NowItem } from "@lg/core";
import { computed, onMounted, reactive, ref } from "vue";
import { AuthError, cms, loadToken, setToken } from "../../lib/cms";

type Tab = "content" | "hobbies" | "links" | "now" | "media" | "guestbook" | "analytics";
const TABS: Tab[] = ["content", "hobbies", "links", "now", "media", "guestbook", "analytics"];

const authed = ref(false);
const login = ref<string | null>(null);
const loading = ref(true);
const tab = ref<Tab>("content");
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

function pickTab(t: Tab) {
  tab.value = t;
  if (t === "media" && media.value.length === 0) void loadMedia();
  if (t === "guestbook" && !guestbook.value) void loadGuestbook();
  if (t === "analytics" && !analytics.value) void loadAnalytics();
}

onMounted(boot);
</script>

<template>
  <div class="cms">
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
    <div v-else>
      <header class="bar">
        <strong>CMS</strong>
        <nav class="tabs">
          <button v-for="t in TABS" :key="t" :class="{ on: tab === t }" @click="pickTab(t)">
            {{ t }}
          </button>
        </nav>
        <div class="right">
          <select v-model="locale" title="Editing locale">
            <option value="en">EN</option>
            <option value="de">DE</option>
          </select>
          <span class="muted">{{ login }}</span>
          <button class="link" @click="signOut">sign out</button>
        </div>
      </header>

      <!-- CONTENT -->
      <section v-show="tab === 'content'" class="pane">
        <div class="card note">
          Edits here go live immediately — no rebuild. The <b>Home</b> intro (headline, lede,
          status) and the <b>About</b> bio all live on this tab. Projects and activity are pulled
          from GitHub automatically, so there's no project editor. Add social/contact buttons under
          <b>Links</b>.
        </div>
        <div class="card">
          <h3>Identity</h3>
          <label>Name<input v-model="meta.name" /></label>
          <label>Handle<input v-model="meta.handle" /></label>
          <label>Location<input :value="lv(meta.location, locale)" @input="setLv(meta.location, locale, ($event.target as HTMLInputElement).value)" /></label>
          <label>Role<input :value="lv(meta.role, locale)" @input="setLv(meta.role, locale, ($event.target as HTMLInputElement).value)" /></label>
          <button class="btn" @click="saveMeta">Save identity</button>
        </div>

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

        <div class="card">
          <h3>Bio <span class="muted">(paragraphs, **bold** supported)</span></h3>
          <div v-for="(p, i) in bio" :key="i" class="row">
            <textarea :value="lv(p, locale)" @input="setLv(p, locale, ($event.target as HTMLTextAreaElement).value)" rows="2" />
            <button class="link danger" @click="bio.splice(i, 1)">remove</button>
          </div>
          <div class="actions"><button class="link" @click="addBio">+ paragraph</button><button class="btn" @click="saveBio">Save bio</button></div>
        </div>
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

      <!-- MEDIA -->
      <section v-show="tab === 'media'" class="pane">
        <div class="card">
          <h3>Upload image</h3>
          <input type="file" accept="image/*" :disabled="uploading" @change="onUpload" />
          <p class="muted">Resized to WebP and stored locally.</p>
        </div>
        <div class="mediagrid">
          <figure v-for="m in media" :key="m">
            <img :src="cms.mediaUrl(m)" loading="lazy" />
            <button class="link" @click="copy(m)">copy URL</button>
          </figure>
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

      <div v-if="toast" class="toast">{{ toast }}</div>
    </div>
  </div>
</template>

<style scoped>
.cms { max-width: 900px; margin: 0 auto; padding: 24px 18px 80px; font-family: var(--f-b); color: var(--ink); }
.center { text-align: center; padding: 60px; }
.muted { color: var(--muted); }
h1, h3 { font-family: var(--f-d); color: var(--ink-strong); }
.gate { max-width: 340px; margin: 12vh auto; display: flex; flex-direction: column; gap: 12px; text-align: center; }
.gate .or { margin: 6px 0; font-size: 12px; color: var(--muted); }
.bar { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; flex-wrap: wrap; }
.bar strong { font-family: var(--f-d); font-size: 18px; color: var(--ink-strong); }
.tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.tabs button { text-transform: capitalize; font-family: var(--f-m); font-size: 12px; padding: 7px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--muted); cursor: pointer; }
.tabs button.on { background: var(--purple); color: #fff; border-color: transparent; }
.right { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 13px; }
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
</style>
