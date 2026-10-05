<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { filterPalette } from "../../composables/editorHelpers";

const props = defineProps<{
  /** Unplaced module ids: modules are singletons, so only those can be added. */
  ids: string[];
  heading: (id: string) => string;
  target: string;
}>();
const emit = defineEmits<{ pick: [id: string]; close: [] }>();

const q = ref("");
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
    </div>
  </div>
</template>
