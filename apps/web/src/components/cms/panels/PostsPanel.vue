<script setup lang="ts">
/**
 * The blog editor.
 *
 * A panel over things that already exist, not a subsystem: posts are markdown
 * assets namespaced under `blog/`, the library already stores and serves them,
 * and `/md/blog/<slug>` already renders them. This is a textarea, a slug, and two
 * pickers that reach into the DAM and the nav tree.
 *
 * Metadata lives in the file's frontmatter rather than in form fields, so what
 * you see is the post — no hidden state, and adding a field is typing rather than
 * a migration.
 */
import { computed, onMounted, ref } from "vue";
import { assetRef, MARKDOWN_MIME, POST_PREFIX, parsePost, slugify } from "@lg/core";
import type { Asset, AssetFolder } from "@lg/core";
import { useCmsContext } from "../../../composables/cmsContext";

const { cms, flash, layoutAreas, openPicker } = useCmsContext();

/**
 * A post is a markdown asset that has a public slug.
 *
 * The panel used to declare its own five-field `PostAsset` with `slug: string` —
 * but the library's slug is optional (most assets have none), so the local shape
 * claimed a guarantee the API doesn't make and every `post.slug` read was
 * unchecked. Narrowing here instead: `isPost` is the one place that turns "an
 * asset" into "a post", and the type follows from the check rather than asserting
 * past it.
 */
type PostAsset = Asset & { slug: string };

const isPost = (a: Asset): a is PostAsset => Boolean(a.slug?.startsWith(POST_PREFIX));

/**
 * `/api/cms/assets` returns `{ assets, folders, tags }`, not a bare array.
 *
 * The client's `handle` resolves to `any`, so `await cms.listAssets() as Asset[]`
 * typechecked, built, and shipped — the cast asserted a shape nobody verified and
 * silenced the one thing that could have caught it. Naming the envelope means the
 * next call site can't make the same claim.
 */
interface AssetListResponse {
  assets: Asset[];
  folders: AssetFolder[];
  tags: string[];
}

const posts = ref<PostAsset[]>([]);
const current = ref<PostAsset | null>(null);
const source = ref("");
const loading = ref(false);
const saving = ref(false);
const editor = ref<HTMLTextAreaElement | null>(null);

/** Parsed live from the textarea, so the summary can't disagree with the file. */
const parsed = computed(() => parsePost(source.value, current.value?.slug ?? "untitled"));
const dirty = ref(false);

async function loadList() {
  const { assets } = await cms.listAssets({ kind: "markdown" });
  posts.value = assets.filter(isPost);
}

async function open(post: PostAsset) {
  loading.value = true;
  try {
    const doc = (await cms.getMarkdown(post.slug)) as { markdown: string };
    current.value = post;
    source.value = doc.markdown;
    dirty.value = false;
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!current.value) return;
  saving.value = true;
  try {
    await cms.putMarkdown(current.value.id, source.value);
    // The title lives in frontmatter; mirror it to the asset row so the library
    // and any picker show the post's name rather than its filename.
    await cms.updateAsset(current.value.id, { title: parsed.value.frontmatter.title });
    dirty.value = false;
    await loadList();
    flash("Saved.");
  } catch (e) {
    flash((e as Error).message || "Save failed.");
  } finally {
    saving.value = false;
  }
}

async function create() {
  const name = window.prompt("Post title");
  if (!name) return;
  const slug = slugify(`${POST_PREFIX}${name}`);
  const today = new Date().toISOString().slice(0, 10);
  // Born a draft, with the frontmatter already correct — an empty file that the
  // parser has to guess at is a worse starting point than a filled one.
  const body = `---\ntitle: ${name}\ndate: ${today}\ndraft: true\ntags: []\n---\n\n`;
  const file = new File([body], `${slug.split("/").pop()}.md`, { type: MARKDOWN_MIME });
  const created = await cms.uploadAsset(file);
  await cms.updateAsset(created.id, { slug, title: name });
  await loadList();
  await open({ ...created, slug });
}

/** Insert at the cursor rather than appending — an editor that only appends
 *  isn't one. */
function insert(text: string) {
  const el = editor.value;
  if (!el) {
    source.value += text;
    return;
  }
  const start = el.selectionStart;
  const end = el.selectionEnd;
  source.value = source.value.slice(0, start) + text + source.value.slice(end);
  dirty.value = true;
  void Promise.resolve().then(() => {
    el.focus();
    el.selectionStart = el.selectionEnd = start + text.length;
  });
}

/**
 * Image picker: the library, in the modal the CMS already opens for every other
 * image field.
 *
 * It used to list the filenames in a `window.prompt` and ask you to type the
 * number — for a media library whose whole job is showing you the picture. The
 * modal isn't new: `openPicker` is what the avatar, the bio and the gallery all
 * use, so this is the panel joining the convention rather than a fifth one.
 */
function pickImage() {
  openPicker((id, asset) => insert(`![${asset.alt ?? ""}](${assetRef(id)})`), "image");
}

/** Link picker: the nav tree the panel already has, so an internal link can't
 *  point at an area that doesn't exist — and can't go stale against a copy
 *  fetched separately. */
const linkPickerOpen = ref(false);
function pickLink() {
  if (!layoutAreas.value.length) {
    flash("No areas loaded.");
    return;
  }
  linkPickerOpen.value = true;
}
function insertLink(area: { id: string; label: string }) {
  linkPickerOpen.value = false;
  insert(`[${area.label}](/${area.id})`);
}

function previewUrl(): string {
  return `/md/${current.value?.slug ?? ""}`;
}

onMounted(loadList);
</script>

<template>
  <section class="pnl">
    <header class="pnl-h">
      <h2>Blog</h2>
      <button class="btn" @click="create">New post</button>
    </header>

    <div class="posts-ed">
      <aside class="posts-list">
        <p v-if="!posts.length" class="sub">No posts yet.</p>
        <button
          v-for="p in posts"
          :key="p.id"
          class="posts-item"
          :class="{ on: current?.id === p.id }"
          @click="open(p)"
        >
          <span class="pi-t">{{ p.title || p.filename }}</span>
          <span class="pi-s">{{ p.slug }}</span>
        </button>
      </aside>

      <div v-if="current" class="posts-main">
        <div class="posts-bar">
          <button class="btn" @click="pickImage">Image</button>
          <button class="btn" @click="pickLink">Link</button>
          <a class="btn" :href="previewUrl()" target="_blank" rel="noopener">Preview</a>
          <span class="posts-meta">
            {{ parsed.frontmatter.draft ? "Draft" : "Published" }} ·
            {{ parsed.frontmatter.tags.length }} tag(s)
            <b v-if="dirty"> · unsaved</b>
          </span>
          <button class="btn btn-primary" :disabled="saving || !dirty" @click="save">
            {{ saving ? "Saving…" : "Save" }}
          </button>
        </div>
        <textarea
          ref="editor"
          v-model="source"
          class="posts-src"
          spellcheck="true"
          :disabled="loading"
          @input="dirty = true"
        />
      </div>
      <p v-else class="sub">Pick a post, or make one.</p>
    </div>

    <!-- Area picker. Same shell as the asset picker (.pickmask/.pickbox), because
         the CMS has one modal look and this is it. -->
    <div v-if="linkPickerOpen" class="pickmask" @click.self="linkPickerOpen = false">
      <div class="pickbox">
        <div class="pickhead">
          <b>Link to an area</b>
          <button class="link" @click="linkPickerOpen = false">close</button>
        </div>
        <div class="modlist">
          <button
            v-for="area in layoutAreas"
            :key="area.id"
            class="posts-item"
            @click="insertLink(area)"
          >
            <span class="pi-t">{{ area.label }}</span>
            <span class="pi-s">/{{ area.id }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
