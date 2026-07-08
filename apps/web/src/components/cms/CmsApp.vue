<script setup lang="ts">
import type { Hobby, Link, Localized, NowItem } from "@lg/core";
import { computed, onMounted, reactive, ref } from "vue";
import { AuthError, cms, loadToken, setToken } from "../../lib/cms";

type Tab = "content" | "hobbies" | "links" | "now" | "media" | "analytics";
const TABS: Tab[] = ["content", "hobbies", "links", "now", "media", "analytics"];

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

function emptyL(): Localized {
  return { en: "" };
}
function lv(obj: Localized, l: "en" | "de") {
  return obj[l] ?? "";
}
function setLv(obj: Localized, l: "en" | "de", val: string) {
  obj[l] = val;
}
function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `id-${Date.now()}`;
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
const delItem = (arr: any, i: number, kind: string) =>
  guarded(async () => {
    const item = arr.value[i];
    if (item.id) await cms.del(`${kind}/${item.id}`);
    arr.value.splice(i, 1);
  }, "Deleted");

// Adders
const addHobby = () =>
  hobbies.value.push({ id: slug("new-hobby"), title: emptyL(), blurb: emptyL(), tone: "purple", sort: hobbies.value.length });
const addLink = () =>
  links.value.push({ id: slug("new-link"), label: emptyL(), href: "", sort: links.value.length });
const addNow = () =>
  now.value.push({ id: slug("new"), key: emptyL(), value: emptyL(), sort: now.value.length });
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
async function loadAnalytics() {
  await guarded(async () => {
    analytics.value = await cms.analytics();
  }, "");
}
const maxTrend = computed(() =>
  Math.max(1, ...(analytics.value?.trend?.map((t: any) => t.count) ?? [1])),
);

function pickTab(t: Tab) {
  tab.value = t;
  if (t === "media" && media.value.length === 0) void loadMedia();
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

      <!-- ANALYTICS -->
      <section v-show="tab === 'analytics'" class="pane">
        <div v-if="!analytics" class="muted">Loading…</div>
        <template v-else>
          <div class="card">
            <h3>Page views · {{ analytics.range.from }} → {{ analytics.range.to }}</h3>
            <div class="trend">
              <div v-for="t in analytics.trend" :key="t.key" class="tbar" :title="`${t.key}: ${t.count}`">
                <div :style="{ height: (t.count / maxTrend) * 100 + '%' }" />
              </div>
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
.trend { display: flex; gap: 3px; align-items: flex-end; height: 90px; }
.tbar { flex: 1; display: flex; align-items: flex-end; }
.tbar > div { width: 100%; background: var(--purple); border-radius: 3px 3px 0 0; min-height: 2px; }
.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--ink-strong); color: var(--bg-base); padding: 10px 18px; border-radius: 10px; font-size: 14px; box-shadow: var(--sh-2); }
</style>
