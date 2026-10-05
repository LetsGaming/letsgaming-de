<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { GuestbookTab } from "../../../lib/cms";
import { useCmsContext } from "../../../composables/cmsContext";
import UndoToast from "../UndoToast.vue";

// View-only panel. All state and handlers come from the shared CMS context.
const { guestbook, gbCounts, gbDeleted, gbTab, loadingG, moderate, removeEntry, setGbTab, statusAt, undoDelete } =
	useCmsContext();

const TABS: { id: GuestbookTab; label: string }[] = [
	{ id: "pending", label: "Pending" },
	{ id: "approved", label: "Approved" },
	{ id: "rejected", label: "Rejected" },
];

const EMPTY: Record<GuestbookTab, string> = {
	pending: "Nothing waiting for review.",
	approved: "No approved entries yet.",
	rejected: "No rejected entries.",
};

const tick = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => (timer = setInterval(() => (tick.value = Date.now()), 5000)));
onBeforeUnmount(() => clearInterval(timer));

const updated = computed(() => {
	if (!statusAt.value) return "";
	const s = Math.max(0, Math.round((tick.value - statusAt.value) / 1000));
	return s < 5 ? "updated just now" : `updated ${s}s ago`;
});
</script>

<template>
  <section class="pane">
    <div class="gb-head">
      <h2>Guestbook</h2>
      <span class="muted gb-updated" aria-live="off">{{ updated }}</span>
    </div>
    <p class="muted">Nothing is public until you approve it. Auto-flags only sort the queue, you decide.</p>

    <div class="gb-tabs" role="tablist" aria-label="Guestbook status">
      <button
        v-for="t in TABS"
        :key="t.id"
        role="tab"
        class="gb-tab"
        :class="{ on: gbTab === t.id }"
        :aria-selected="gbTab === t.id"
        @click="setGbTab(t.id)"
      >
        {{ t.label }} <span class="gb-count">{{ gbCounts[t.id] }}</span>
      </button>
    </div>

    <div v-if="loadingG" class="muted">Loading...</div>
    <div v-else-if="!guestbook?.entries.length" class="muted">{{ EMPTY[gbTab] }}</div>
    <div v-else class="gb-mod">
      <div v-for="e in guestbook.entries" :key="e.id" class="gb-row">
        <div class="gb-body">
          <div class="gb-meta">
            <b>{{ e.name }}</b>
            <span class="muted">{{ new Date(e.createdAt).toLocaleString() }}</span>
            <span v-if="e.flags.length" class="gb-flags" :title="`score ${e.score}`">
              Flagged: {{ e.flags.join(", ") }}
            </span>
          </div>
          <p class="gb-text">{{ e.message }}</p>
        </div>
        <div class="gb-buttons">
          <button v-if="e.status !== 'approved'" class="btn" @click="moderate(e.id, 'approve')">Approve</button>
          <button v-if="e.status === 'pending'" class="btn ghost" @click="moderate(e.id, 'reject')">Reject</button>
          <button v-if="e.status === 'approved'" class="btn ghost" @click="moderate(e.id, 'unapprove')">
            Unapprove
          </button>
          <button class="btn ghost gb-del" @click="removeEntry(e.id)">Delete</button>
        </div>
      </div>
    </div>

    <UndoToast v-if="gbDeleted" message="Entry deleted." action-label="Undo" @action="undoDelete" />
  </section>
</template>

<style scoped>
.gb-updated {
  font-size: 12px;
}
.gb-tabs {
  display: flex;
  gap: var(--sp-6);
  margin: var(--sp-12) 0;
  border-bottom: 1px solid var(--line);
}
.gb-tab {
  font: inherit;
  font-size: 14px;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: var(--sp-8) var(--sp-12);
  color: var(--muted);
  cursor: pointer;
}
.gb-tab.on {
  color: var(--ink-strong);
  border-bottom-color: var(--purple-br);
}
.gb-count {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  margin-left: var(--sp-4);
}
.gb-del {
  color: var(--danger-ink);
}
</style>
