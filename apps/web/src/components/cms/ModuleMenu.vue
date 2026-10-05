<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

defineProps<{
  /** Where the module can go, each as a page or Hidden. */
  options: { id: string; label: string }[];
  /** The list the module is in now; left out of "Move to". */
  current: string;
  name: string;
}>();
const emit = defineEmits<{ move: [target: string]; hide: [] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const away = (e: Event) => {
  if (!root.value?.contains(e.target as Node)) close();
};
function toggle() {
  open.value ? close() : show();
}
function show() {
  open.value = true;
  document.addEventListener("pointerdown", away, true);
}
function close() {
  open.value = false;
  document.removeEventListener("pointerdown", away, true);
}
onBeforeUnmount(close);
</script>

<template>
  <span ref="root" class="modmenu-wrap" @keydown.esc.stop="close" @contextmenu.prevent="show">
    <button
      class="modmenu-btn"
      :aria-label="`Actions for ${name}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      ⋯
    </button>
    <div v-if="open" class="modmenu" role="menu" @click.stop>
      <h5>Move to</h5>
      <template v-for="o in options" :key="o.id">
        <button v-if="o.id !== current && o.id !== 'hidden'" role="menuitem" @click="emit('move', o.id); close()">
          {{ o.label }}
        </button>
      </template>
      <button v-if="current !== 'hidden'" role="menuitem" @click="emit('hide'); close()">Hide</button>
    </div>
  </span>
</template>
