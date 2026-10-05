<script setup lang="ts">
import { onMounted, ref } from "vue";

defineProps<{ name: string }>();
const emit = defineEmits<{ save: [alt: string]; skip: [] }>();

const text = ref("");
const input = ref<HTMLInputElement | null>(null);
onMounted(() => input.value?.focus());

function save() {
  const alt = text.value.trim();
  if (alt) emit("save", alt);
  else emit("skip");
}
</script>

<template>
  <form class="altprompt" @submit.prevent="save" @click.stop @keydown.esc.stop.prevent="emit('skip')">
    <label>
      <span class="altname">Alt text for {{ name }}</span>
      <input ref="input" v-model="text" type="text" maxlength="200" placeholder="Describe the image, Enter to save, Esc to skip" />
    </label>
  </form>
</template>

<style scoped>
.altprompt { background: var(--surf-1); border: 1px solid var(--line-1); border-radius: 10px; padding: var(--sp-8); box-shadow: 0 6px 20px rgb(0 0 0 / 0.25); width: min(380px, 90%); }
.altprompt label { display: flex; flex-direction: column; gap: var(--sp-4); font-size: 12px; color: var(--muted); }
.altname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.altprompt input { font-size: 13px; color: var(--ink); }
</style>
