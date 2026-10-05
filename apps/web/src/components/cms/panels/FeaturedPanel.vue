<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { FEATURED_MAX, DEFAULT_FEATURED_SETTINGS, type FeaturedSettings } from "@lg/core";
import { cms } from "../../../lib/cms";
import { useCmsContext } from "../../../composables/cmsContext";

const { modules, guarded, refreshCanvas } = useCmsContext();

interface RepoRow {
  name: string;
  description?: string;
  language?: string;
  pinned: boolean;
}

const featured = computed(() => modules.value.find((m) => m.kind === "featured"));

const mode = ref<FeaturedSettings["mode"]>("auto");
const count = ref<FeaturedSettings["count"]>(DEFAULT_FEATURED_SETTINGS.count);
const picked = ref<string[]>([]);
const query = ref("");
const repos = ref<RepoRow[]>([]);
const loaded = ref(false);

onMounted(async () => {
  try {
    repos.value = (await cms.githubRepos()).repos;
  } catch {
    repos.value = [];
  }
  loaded.value = true;
});

watch(
  featured,
  (m) => {
    const s = m?.settings ?? DEFAULT_FEATURED_SETTINGS;
    mode.value = s.mode;
    count.value = s.count;
    picked.value = [...s.repos];
  },
  { immediate: true },
);

const pinnedNames = computed(() => repos.value.filter((r) => r.pinned).map((r) => r.name));

const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  return repos.value.filter(
    (r) =>
      !picked.value.includes(r.name) &&
      (!q || r.name.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q)),
  );
});

const full = computed(() => picked.value.length >= FEATURED_MAX);
const known = (name: string) => repos.value.some((r) => r.name === name);

function add(name: string) {
  if (!full.value) picked.value.push(name);
}
function remove(i: number) {
  picked.value.splice(i, 1);
}
function move(i: number, by: -1 | 1) {
  const j = i + by;
  if (j < 0 || j >= picked.value.length) return;
  const next = [...picked.value];
  [next[i], next[j]] = [next[j]!, next[i]!];
  picked.value = next;
}

async function save() {
  const m = featured.value;
  if (!m) return;
  const settings: FeaturedSettings = { mode: mode.value, repos: picked.value, count: count.value };
  await guarded(() => cms.put("modules", { modules: [{ id: m.id, settings }] }), "Featured saved");
  m.settings = settings;
  void refreshCanvas();
}
</script>

<template>
  <section class="pane">
    <div class="card">
      <h3>Featured</h3>
      <p class="muted">
        The project cards on the home page. Auto follows the repos pinned on your GitHub profile, in
        pin order. Manual shows the repos you choose.
      </p>

      <h4>Mode</h4>
      <div class="seg" role="group" aria-label="Featured mode">
        <button type="button" :class="{ on: mode === 'auto' }" :aria-pressed="mode === 'auto'" @click="mode = 'auto'">
          Auto (pinned)
        </button>
        <button type="button" :class="{ on: mode === 'manual' }" :aria-pressed="mode === 'manual'" @click="mode = 'manual'">
          Manual
        </button>
      </div>

      <h4>Cards to show</h4>
      <div class="seg" role="group" aria-label="Number of cards">
        <button
          v-for="n in [1, 2, 3] as const"
          :key="n"
          type="button"
          :class="{ on: count === n }"
          :aria-pressed="count === n"
          @click="count = n"
        >
          {{ n }}
        </button>
      </div>

      <p v-if="mode === 'auto'" class="muted note">
        <template v-if="pinnedNames.length">Pinned now: {{ pinnedNames.slice(0, count).join(", ") }}.</template>
        <template v-else-if="loaded">Nothing is pinned yet, so the most recently updated repos are shown.</template>
      </p>

      <div v-else class="picker">
        <h4>Chosen repos ({{ picked.length }}/{{ FEATURED_MAX }})</h4>
        <p v-if="!picked.length" class="muted note">
          None chosen. Until you pick one, the pinned repos are shown.
        </p>
        <ol v-else class="chosen">
          <li v-for="(name, i) in picked" :key="name">
            <span class="rname">{{ name }}</span>
            <span v-if="!known(name)" class="muted"> (not in the last sync)</span>
            <span class="rbtns">
              <button type="button" class="btn ghost" :disabled="i === 0" :aria-label="`Move ${name} up`" @click="move(i, -1)">Up</button>
              <button
                type="button"
                class="btn ghost"
                :disabled="i === picked.length - 1"
                :aria-label="`Move ${name} down`"
                @click="move(i, 1)"
              >
                Down
              </button>
              <button type="button" class="btn ghost" :aria-label="`Remove ${name}`" @click="remove(i)">Remove</button>
            </span>
          </li>
        </ol>

        <h4>Add a repo</h4>
        <input v-model="query" type="search" placeholder="Search synced repos" aria-label="Search synced repos" />
        <p v-if="loaded && !repos.length" class="muted note">No repos synced yet. Run a GitHub sync first.</p>
        <ul class="results">
          <li v-for="r in results.slice(0, 30)" :key="r.name">
            <button type="button" class="rrow" :disabled="full" @click="add(r.name)">
              <span class="rname">{{ r.name }}</span>
              <span v-if="r.pinned" class="muted"> pinned</span>
              <span v-if="r.language" class="muted"> {{ r.language }}</span>
            </button>
          </li>
        </ul>
        <p v-if="full" class="muted note">Remove one to add another.</p>
      </div>

      <div class="actions"><button class="btn" :disabled="!featured" @click="save">Save Featured</button></div>
    </div>
  </section>
</template>

<style scoped>
.pane h4 {
  margin: var(--sp-16) 0 var(--sp-6);
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
}
.note {
  font-size: var(--fs-micro);
  margin-top: var(--sp-10);
}
.chosen,
.results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-6);
}
.chosen li {
  display: flex;
  align-items: center;
  gap: var(--sp-8);
  flex-wrap: wrap;
}
.rname {
  font-family: var(--f-m);
  font-size: 13px;
}
.rbtns {
  margin-left: auto;
  display: inline-flex;
  gap: var(--sp-4);
}
.results {
  margin-top: var(--sp-8);
  max-height: 260px;
  overflow: auto;
}
.rrow {
  display: flex;
  gap: var(--sp-10);
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  background: var(--card-2);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  padding: var(--sp-6) var(--sp-10);
  cursor: pointer;
}
.rrow:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
