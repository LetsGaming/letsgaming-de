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
import { POST_PREFIX, parsePost, slugify } from "@lg/core";
import { useCms } from "../../../composables/useCms";

const { cms, flash, layoutAreas } = useCms();

interface PostAsset {
  id: string;
  slug: string;
  filename: string;
  title?: string;
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
  const all = (await cms.listAssets({ kind: "markdown" })) as PostAsset[];
  posts.value = all.filter((a) => a.slug?.startsWith(POST_PREFIX));
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
  const file = new File([body], `${slug.split("/").pop()}.md`, { type: "text/markdown" });
  const created = (await cms.uploadAsset(file)) as PostAsset;
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

/** Image picker: straight into the existing DAM. No uploads here — the library
 *  is the library, and a second upload path would mean two sets of rules. */
async function pickImage() {
  const all = (await cms.listAssets({ kind: "image" })) as { id: string; filename: string; alt?: string }[];
  if (!all.length) return flash("No images in the library yet.");
  const choice = window.prompt(
    `Image to insert:\n${all.map((a, i) => `${i + 1}. ${a.filename}`).join("\n")}`,
    "1",
  );
  const a = choice ? all[Number(choice) - 1] : undefined;
  if (a) insert(`![${a.alt ?? ""}](asset:${a.id})`);
}

/** Link picker: the nav tree the panel already has, so an internal link can't
 *  point at an area that doesn't exist — and can't go stale against a copy
 *  fetched separately. */
function pickLink() {
  const areas = (layoutAreas.value ?? []) as { id: string }[];
  if (!areas.length) {
    flash("No areas loaded.");
    return;
  }
  const choice = window.prompt(
    `Link to area:\n${areas.map((n, i) => `${i + 1}. ${n.id}`).join("\n")}`,
    "1",
  );
  const n = choice ? areas[Number(choice) - 1] : undefined;
  if (n) insert(`[${n.id}](/${n.id})`);
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
  </section>
</template>
