<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { filterPalette, type PaletteItem } from "../../composables/editorHelpers";

const props = defineProps<{ items: PaletteItem[] }>();
const emit = defineEmits<{ close: [] }>();

const q = ref("");
const at = ref(0);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);
const shown = computed(() => filterPalette(props.items, q.value));

watch(q, () => (at.value = 0));
onMounted(() => input.value?.focus());

function step(d: number) {
  const n = shown.value.length;
  if (!n) return;
  at.value = (at.value + d + n) % n;
  void nextTick(() => list.value?.children[at.value]?.scrollIntoView({ block: "nearest" }));
}
function run(i: PaletteItem | undefined) {
  if (!i) return;
  emit("close");
  i.run();
}
</script>

<template>
  <div class="palette-mask" @click.self="emit('close')">
    <div class="palette" role="dialog" aria-label="Command palette">
      <input
        ref="input"
        v-model="q"
        placeholder="Jump to a page, module or action"
        aria-label="Command"
        @keydown.down.prevent="step(1)"
        @keydown.up.prevent="step(-1)"
        @keydown.enter.prevent="run(shown[at])"
        @keydown.esc.stop="emit('close')"
      />
      <ol ref="list" role="listbox">
        <li
          v-for="(it, i) in shown"
          :key="it.id"
          role="option"
          :aria-selected="i === at"
          :class="{ on: i === at }"
          @mousemove="at = i"
          @click="run(it)"
        >
          <span>{{ it.label }}</span>
          <span class="dim">{{ it.group }}</span>
        </li>
        <li v-if="!shown.length" class="dim">Nothing matches.</li>
      </ol>
    </div>
  </div>
</template>
