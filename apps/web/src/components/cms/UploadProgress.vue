<script setup lang="ts">
import type { UploadItem } from "../../lib/upload";

defineProps<{ items: UploadItem[] }>();
defineEmits<{ dismiss: [] }>();
</script>

<template>
  <ul v-if="items.length" class="upl" aria-live="polite">
    <li v-for="it in items" :key="it.id" class="uplrow" :class="it.status">
      <span class="uplname">{{ it.name }}</span>
      <span v-if="it.status === 'error'" class="upler">{{ it.error }}</span>
      <span v-else-if="it.status === 'done'" class="uplok">Uploaded</span>
      <span
        v-else
        class="uplbar"
        role="progressbar"
        :aria-valuenow="Math.round(it.progress * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span class="uplfill" :style="{ width: Math.round(it.progress * 100) + '%' }" />
      </span>
    </li>
    <li v-if="items.every((i) => i.status === 'done' || i.status === 'error')" class="uplclear">
      <button class="link" type="button" @click="$emit('dismiss')">dismiss</button>
    </li>
  </ul>
</template>

<style scoped>
.upl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-4); font-size: 12px; }
.uplrow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(60px, 40%); gap: var(--sp-8); align-items: center; }
.uplname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.uplbar { height: 6px; border-radius: 999px; background: var(--surf-2); overflow: hidden; }
.uplfill { display: block; height: 100%; background: var(--live-solid); transition: width 0.15s linear; }
.uplok { color: var(--muted); text-align: right; }
.upler { color: var(--danger-ink); text-align: right; }
.uplclear { text-align: right; }
</style>
