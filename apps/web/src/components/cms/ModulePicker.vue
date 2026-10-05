<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { filterPalette } from "../../composables/editorHelpers";

const props = defineProps<{
  /** Unplaced module ids: modules are singletons, so only those can be added. */
  ids: string[];
  heading: (id: string) => string;
  target: string;
}>();
const emit = defineEmits<{ pick: [id: string]; newGallery: [name: string]; close: [] }>();

const q = ref("");
const galleryName = ref("");
function createNew() {
  const name = galleryName.value.trim();
  if (name) emit("newGallery", name);
}
const input = ref<HTMLInputElement | null>(null);
const rows = computed(() =>
  filterPalette(
    props.ids.map((id) => ({ id, label: `${props.heading(id)} ${id}` })),
    q.value,
  ),
);
onMounted(() => input.value?.focus());
</script>

<template>
  <div class="pickmask" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
    <div class="pickbox" role="dialog" aria-label="Add a module">
      <div class="pickhead">
        <b>Add a module to {{ target }}</b>
        <button class="link" @click="emit('close')">close</button>
      </div>
      <input
        ref="input"
        v-model="q"
        type="search"
        placeholder="Search modules"
        @keydown.enter="rows[0] && emit('pick', rows[0].id)"
      />
      <ol class="modlist">
        <li v-for="r in rows" :key="r.id" class="modrow">
          <span class="modname">{{ heading(r.id) }} <span class="muted">({{ r.id }})</span></span>
          <button class="link" @click="emit('pick', r.id)">add here</button>
        </li>
        <li v-if="!rows.length" class="dim">No unplaced module matches.</li>
      </ol>
      <form class="modrow newgal" @submit.prevent="createNew">
        <span class="modname">New gallery</span>
        <input v-model="galleryName" type="text" maxlength="60" placeholder="Name, e.g. Travel" aria-label="New gallery name" />
        <button class="link" type="submit" :disabled="!galleryName.trim()">create and add here</button>
      </form>
    </div>
  </div>
</template>
