<script setup lang="ts">
const emit = defineEmits<{ close: [] }>();

const KEYS: [string, string][] = [
  ["Ctrl+K", "Command palette"],
  ["Alt+Up / Alt+Down", "Move the selected module up or down"],
  ["Delete", "Remove the selected module from its page (to Hidden)"],
  ["Esc", "Back to Structure"],
  ["?", "This list"],
];
</script>

<template>
  <div class="pickmask" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
    <div class="pickbox shortcuts" role="dialog" aria-label="Keyboard shortcuts">
      <div class="pickhead">
        <b>Keyboard shortcuts</b>
        <button class="link" @click="emit('close')">close</button>
      </div>
      <dl>
        <template v-for="[k, d] in KEYS" :key="k">
          <dt><kbd>{{ k }}</kbd></dt>
          <dd>{{ d }}</dd>
        </template>
      </dl>
    </div>
  </div>
</template>
