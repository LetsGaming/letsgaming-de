<script setup lang="ts">
/**
 * The one place the editor says whether your edits are safe: undo and redo for
 * this session, then a single status chip. Edits save themselves, so this is the
 * only save UI there is.
 */
import { computed, onBeforeUnmount, ref } from "vue";
import { useCmsContext } from "../../composables/cmsContext";

const { autosaveStatus: saveStatus, undo, retrySave } = useCmsContext();

// Re-evaluated on a slow tick so the "saved 2m ago" tooltip doesn't go stale.
const clock = ref(Date.now());
const timer = window.setInterval(() => (clock.value = Date.now()), 15_000);
onBeforeUnmount(() => window.clearInterval(timer));

const ago = computed(() => {
  const s = saveStatus.value;
  if (s.state !== "saved") return "";
  const secs = Math.max(0, Math.round((clock.value - s.at) / 1000));
  if (secs < 45) return "Saved just now";
  const m = Math.round(secs / 60);
  return m < 60 ? `Saved ${m} min ago` : `Saved ${Math.round(m / 60)} h ago`;
});

const undoTitle = computed(() => (undo.undoLabel.value ? `Undo: ${undo.undoLabel.value} (Ctrl+Z)` : "Nothing to undo"));
const redoTitle = computed(() => (undo.redoLabel.value ? `Redo: ${undo.redoLabel.value} (Ctrl+Shift+Z)` : "Nothing to redo"));
</script>

<template>
  <span class="savebar">
    <button class="savebar-btn" type="button" :disabled="!undo.undoLabel.value" :title="undoTitle" :aria-label="undoTitle" @click="undo.undo()">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3 2.5 6.5 6 10M3 6.5h6.5a4 4 0 0 1 0 8H7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button class="savebar-btn" type="button" :disabled="!undo.redoLabel.value" :title="redoTitle" :aria-label="redoTitle" @click="undo.redo()">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3l3.5 3.5L10 10M13 6.5H6.5a4 4 0 0 0 0 8H9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <span class="savechip" role="status" aria-live="polite" :data-state="saveStatus.state" :title="saveStatus.state === 'error' ? saveStatus.message : ago">
      <template v-if="saveStatus.state === 'saving'">Saving…</template>
      <template v-else-if="saveStatus.state === 'saved'">Saved</template>
      <button v-else-if="saveStatus.state === 'error'" type="button" class="savechip-retry" @click="retrySave">
        Not saved. Retry
      </button>
      <template v-else>All changes saved</template>
    </span>
    <span v-if="saveStatus.state === 'error'" class="saveerr" role="alert">{{ saveStatus.message }}</span>
  </span>
</template>
