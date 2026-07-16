<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { cms } from "../../lib/cms";

interface Asset {
  id: string; kind: string; ext: string; mime: string; bytes: number;
  width?: number; height?: number; slug?: string; filename: string;
  alt?: string; title?: string; caption?: string; description?: string;
  folderId?: string | null; tags: string[]; createdAt: string;
}
interface Folder { id: string; name: string; parentId: string | null }
interface Detail extends Asset {
  variants: { format: string; width: number; bytes: number }[];
  usages: { context: string; label?: string }[];
}

// In `pick` mode the grid emits a chosen asset instead of opening the editor.
// `only` locks the type filter (e.g. "svg" for an icon picker, "image" for a photo).
const props = defineProps<{ pick?: boolean; only?: string }>();
const emit = defineEmits<{ (e: "select", asset: Asset): void }>();

// When the picker is locked to a type, hint the OS file dialog with a matching
// `accept`. On mobile a bare file input tends to offer only the camera/files apps;
// an image accept makes the photo gallery a first-class option (the whole point of
// picking an avatar/hero from your phone). Left unset for the general library so any
// file type can still be uploaded.
const ACCEPT: Record<string, string> = {
  image: "image/*",
  svg: ".svg,image/svg+xml",
  gif: "image/gif",
  pdf: ".pdf,application/pdf",
  markdown: ".md,.markdown,text/markdown",
};
const acceptAttr = computed(() => (props.only ? ACCEPT[props.only] : undefined));

const assets = ref<Asset[]>([]);
const folders = ref<Folder[]>([]);
const tags = ref<string[]>([]);
const activeFolder = ref<"all" | "root" | string>("all");
const activeTag = ref("");
const activeKind = ref("");
const q = ref("");
const selected = ref<Detail | null>(null);
const tagText = ref("");
const loading = ref(false);
const uploading = ref(false);
const toast = ref("");

const KINDS = ["image", "svg", "gif", "pdf", "markdown", "file"];
function flash(m: string) { toast.value = m; setTimeout(() => (toast.value = ""), 1800); }
function humanSize(b: number) { return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`; }
function thumb(a: Asset) { return a.kind === "image" || a.kind === "gif" ? cms.assetUrl(a.id, "w320.webp") : ""; }
function kindGlyph(k: string) { return ({ pdf: "PDF", markdown: "MD", svg: "SVG", file: "FILE" } as Record<string, string>)[k] ?? ""; }

async function load() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (activeFolder.value === "root") params.folder = "root";
    else if (activeFolder.value !== "all") params.folder = activeFolder.value;
    if (activeTag.value) params.tag = activeTag.value;
    if (activeKind.value) params.kind = activeKind.value;
    if (q.value.trim()) params.q = q.value.trim();
    const data = await cms.listAssets(params);
    assets.value = data.assets;
    folders.value = data.folders;
    tags.value = data.tags;
  } catch {
    flash("Couldn't load the library.");
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  if (props.only) activeKind.value = props.only;
  void load();
});

const dragging = ref(false);
async function uploadFiles(files: File[]) {
  if (!files.length) return;
  uploading.value = true;
  try {
    for (const f of files) await cms.uploadAsset(f);
    flash(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}`);
    await load();
  } catch {
    flash("Upload failed.");
  } finally {
    uploading.value = false;
  }
}
async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  await uploadFiles(Array.from(input.files ?? []));
  input.value = "";
}
function onDrop(e: DragEvent) {
  dragging.value = false;
  void uploadFiles(Array.from(e.dataTransfer?.files ?? []));
}

async function open(a: Asset) {
  if (props.pick) { emit("select", a); return; }
  selected.value = await cms.getAsset(a.id);
  tagText.value = (selected.value?.tags ?? []).join(", ");
}
function close() { selected.value = null; }

async function saveMeta() {
  if (!selected.value) return;
  const s = selected.value;
  await cms.updateAsset(s.id, {
    filename: s.filename, alt: s.alt ?? "", title: s.title ?? "",
    caption: s.caption ?? "", description: s.description ?? "",
    folderId: s.folderId ?? null,
    tags: tagText.value.split(",").map((t) => t.trim()).filter(Boolean),
  });
  flash("Saved");
  await load();
}

async function remove() {
  if (!selected.value) return;
  const s = selected.value;
  const used = s.usages.length;
  const msg = used
    ? `This asset is used in ${used} place${used > 1 ? "s" : ""}:\n\n` +
      s.usages.map((u) => `• ${u.label ?? u.context}`).join("\n") +
      `\n\nDelete anyway? Those references will break.`
    : "Delete this asset? This can't be undone.";
  if (!confirm(msg)) return;
  await cms.deleteAsset(s.id);
  flash("Deleted");
  close();
  await load();
}

async function addFolder() {
  const name = prompt("New folder name:")?.trim();
  if (!name) return;
  await cms.createAssetFolder(name, null);
  await load();
}
async function delFolder(id: string) {
  if (!confirm("Delete this folder? Assets inside move back to the root.")) return;
  if (activeFolder.value === id) activeFolder.value = "all";
  await cms.deleteAssetFolder(id);
  await load();
}
function setFolder(f: "all" | "root" | string) { activeFolder.value = f; void load(); }
function setKind(k: string) { activeKind.value = activeKind.value === k ? "" : k; void load(); }
function setTag(t: string) { activeTag.value = activeTag.value === t ? "" : t; void load(); }
</script>

<template>
  <div
    class="lib"
    :class="{ dragging }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <div v-if="dragging" class="droplay">Drop files to upload</div>
    <div class="libtools">
      <label class="up btn">
        {{ uploading ? "Uploading…" : "Upload" }}
        <input type="file" multiple :accept="acceptAttr" :disabled="uploading" hidden @change="onUpload" />
      </label>
      <input v-model="q" class="search" placeholder="Search filename, title, alt…" @keyup.enter="load" />
      <select v-if="!only" v-model="activeKind" @change="load">
        <option value="">All types</option>
        <option v-for="k in KINDS" :key="k" :value="k">{{ k }}</option>
      </select>
    </div>

    <div class="libbody">
      <aside class="libnav">
        <div class="navsec">
          <div class="navhead"><span>Folders</span><button class="link" @click="addFolder">+ new</button></div>
          <button :class="{ on: activeFolder === 'all' }" @click="setFolder('all')">All</button>
          <button :class="{ on: activeFolder === 'root' }" @click="setFolder('root')">Root (no folder)</button>
          <div v-for="f in folders" :key="f.id" class="frow">
            <button :class="{ on: activeFolder === f.id }" @click="setFolder(f.id)">{{ f.name }}</button>
            <button class="link danger" title="Delete folder" @click="delFolder(f.id)">×</button>
          </div>
        </div>
        <div v-if="tags.length" class="navsec">
          <div class="navhead"><span>Tags</span></div>
          <div class="tagcloud">
            <button v-for="t in tags" :key="t" class="tag" :class="{ on: activeTag === t }" @click="setTag(t)">#{{ t }}</button>
          </div>
        </div>
      </aside>

      <div class="libmain">
        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="!assets.length" class="muted">Nothing here yet. Upload something to start your library.</div>
        <div v-else class="grid">
          <button v-for="a in assets" :key="a.id" class="tile" @click="open(a)">
            <span class="thumb">
              <img v-if="thumb(a)" :src="thumb(a)" loading="lazy" @error="($event.target as HTMLImageElement).style.display='none'" />
              <span v-else class="glyph">{{ kindGlyph(a.kind) }}</span>
            </span>
            <span class="tname">{{ a.title || a.filename }}</span>
            <span class="tmeta">{{ a.kind }} · {{ humanSize(a.bytes) }}</span>
          </button>
        </div>
      </div>

      <aside v-if="selected && !pick" class="libedit">
        <div class="editbar"><b>Edit asset</b><button class="link" @click="close">close</button></div>
        <div class="epreview">
          <img v-if="thumb(selected)" :src="cms.assetUrl(selected.id)" loading="lazy" />
          <span v-else class="glyph big">{{ kindGlyph(selected.kind) }}</span>
        </div>
        <label>Filename<input v-model="selected.filename" /></label>
        <label>Alt text<input v-model="selected.alt" placeholder="describe the image" /></label>
        <label>Title<input v-model="selected.title" /></label>
        <label>Caption<input v-model="selected.caption" /></label>
        <label>Description<textarea v-model="selected.description" rows="2" /></label>
        <label>Folder
          <select v-model="selected.folderId">
            <option :value="null">— root —</option>
            <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <label>Tags <span class="muted">(comma-separated)</span><input v-model="tagText" placeholder="travel, 2024" /></label>

        <div class="usage">
          <b>Used in</b>
          <p v-if="!selected.usages.length" class="muted">Not referenced anywhere yet.</p>
          <ul v-else><li v-for="u in selected.usages" :key="u.context">{{ u.label ?? u.context }}</li></ul>
        </div>
        <p class="muted small">
          {{ selected.kind }}<span v-if="selected.width">, {{ selected.width }}×{{ selected.height }}</span>,
          {{ humanSize(selected.bytes) }}<span v-if="selected.slug"> · /md/{{ selected.slug }}</span>
          <span v-if="selected.variants?.length"> · {{ selected.variants.length }} cached size(s)</span>
        </p>
        <div class="editact">
          <button class="btn" @click="saveMeta">Save</button>
          <button class="link danger" @click="remove">Delete</button>
        </div>
      </aside>
    </div>
    <div v-if="toast" class="libtoast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.lib { display: flex; flex-direction: column; gap: var(--sp-12); position: relative; }
.lib.dragging { outline: 2px dashed var(--ink); outline-offset: 6px; border-radius: 12px; }
.droplay { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: var(--surf-2); border-radius: 12px; font-family: var(--f-m); color: var(--ink-strong); pointer-events: none; }
.libtools { display: flex; gap: var(--sp-10); align-items: center; flex-wrap: wrap; }
.libtools .search { flex: 1; min-width: 160px; }
.up { cursor: pointer; }
.up input { position: absolute; width: 0; height: 0; }
.libbody { display: grid; grid-template-columns: 180px minmax(0, 1fr) auto; gap: var(--sp-16); align-items: start; }
.libnav { display: flex; flex-direction: column; gap: var(--sp-16); }
.navsec { display: flex; flex-direction: column; gap: var(--sp-4); }
.navhead { display: flex; justify-content: space-between; align-items: center; font-family: var(--f-m); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.libnav button { text-align: left; font-size: 13px; padding: 5px var(--sp-8); border-radius: 8px; border: none; background: none; color: var(--ink); cursor: pointer; }
.libnav button.on { background: var(--ink); color: #fff; }
.frow { display: flex; align-items: center; }
.frow button:first-child { flex: 1; }
.tagcloud { display: flex; flex-wrap: wrap; gap: var(--sp-4); }
.tag { font-size: 11px !important; padding: 3px 7px !important; border: 1px solid var(--line-1) !important; border-radius: 999px !important; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: var(--sp-10); }
.tile { display: flex; flex-direction: column; gap: var(--sp-4); padding: var(--sp-8); border: 1px solid var(--line-1); border-radius: 12px; background: var(--surf-1); cursor: pointer; text-align: left; }
.tile:hover { border-color: var(--ink); }
.thumb { display: flex; align-items: center; justify-content: center; aspect-ratio: 4 / 3; background: var(--surf-2); border-radius: 8px; overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.glyph { font-family: var(--f-m); font-size: 12px; color: var(--muted); font-weight: 700; }
.glyph.big { font-size: 20px; }
.tname { font-size: 12px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tmeta { font-size: 11px; color: var(--muted); }
.libedit { width: 300px; display: flex; flex-direction: column; gap: var(--sp-8); background: var(--surf-1); border: 1px solid var(--line-1); border-radius: 14px; padding: var(--sp-14); position: sticky; top: 16px; }
.editbar { display: flex; justify-content: space-between; align-items: center; }
.epreview { display: flex; align-items: center; justify-content: center; aspect-ratio: 4 / 3; background: var(--surf-2); border-radius: 10px; overflow: hidden; }
.epreview img { width: 100%; height: 100%; object-fit: contain; }
.libedit label { display: flex; flex-direction: column; gap: 3px; font-family: var(--f-m); font-size: 11px; color: var(--muted); }
.libedit input, .libedit textarea, .libedit select { font-family: var(--f-b); font-size: 13px; color: var(--ink); }
.usage { font-size: 12px; }
.usage ul { margin: var(--sp-4) 0 0; padding-left: var(--sp-18); }
.small { font-size: 11px; }
.editact { display: flex; justify-content: space-between; align-items: center; margin-top: var(--sp-4); }
.libtoast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--ink-strong); color: var(--surf-0); padding: var(--sp-8) var(--sp-16); border-radius: 999px; font-size: 13px; }
@media (max-width: 900px) { .libbody { grid-template-columns: 1fr; } .libedit { width: auto; position: static; } }
</style>
