<script setup lang="ts">
defineProps<{ message: string; actionLabel: string }>();
const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <div class="undo" role="status" aria-live="polite">
    <span>{{ message }}</span>
    <button class="undo-btn" @click="emit('action')">{{ actionLabel }}</button>
  </div>
</template>

<style scoped>
.undo {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--sp-14);
  background: var(--ink-strong);
  color: var(--bg-base);
  padding: var(--sp-10) var(--sp-18);
  border-radius: var(--r-s);
  font-size: 14px;
  box-shadow: var(--sh-2);
  z-index: 50;
}
.undo-btn {
  font: inherit;
  font-weight: 600;
  background: none;
  border: 0;
  padding: 0;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
</style>
