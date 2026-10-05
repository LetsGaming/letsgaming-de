<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useCmsContext } from "../../../composables/cmsContext";
import { relativeTime } from "../../../lib/relativeTime";
import Sparkline from "../Sparkline.vue";

// View-only panel. All state and handlers come from the shared CMS context.
const { cmsStatus, continueEditing, continuePage, gbCounts, pick, syncNow, syncing, viewSite, visits, visitsError } =
	useCmsContext();

const tick = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => (timer = setInterval(() => (tick.value = Date.now()), 30_000)));
onBeforeUnmount(() => clearInterval(timer));
const ago = (iso: string | null) => relativeTime(iso, tick.value);

const change = computed(() => {
	const p = visits.value?.pct;
	if (p == null) return null;
	return `${p >= 0 ? "+" : ""}${Math.round(p)}% vs previous 7 days`;
});
</script>

<template>
  <section class="pane dash">
    <div class="card dash-hero">
      <p>Welcome back. Edits go live immediately.</p>
      <div class="dash-actions">
        <button v-if="continuePage" class="btn primary" @click="continueEditing">
          Continue editing: {{ continuePage.label }}
        </button>
        <button class="btn ghost" @click="viewSite">View site</button>
      </div>
    </div>

    <div class="dash-grid">
      <div class="card">
        <h3>Confirmed visits, last 7 days</h3>
        <p v-if="visitsError" class="muted">Couldn't load visits.</p>
        <p v-else-if="!visits" class="muted">Loading...</p>
        <template v-else>
          <div class="dash-visits">
            <span class="dash-big">{{ visits.total }}</span>
            <Sparkline :values="visits.series" label="Confirmed visits per day, last 7 days" />
          </div>
          <p class="muted dash-sub">
            {{ change ?? "No earlier data to compare" }} · in-page script
          </p>
          <p v-if="visits.total === 0" class="muted dash-sub">No confirmed visits yet this week.</p>
        </template>
      </div>

      <div class="card">
        <h3>Guestbook</h3>
        <p v-if="gbCounts.pending">
          <b>{{ gbCounts.pending }}</b> {{ gbCounts.pending === 1 ? "entry is" : "entries are" }} waiting for review.
        </p>
        <p v-else class="muted">Nothing waiting for review.</p>
        <button class="btn ghost" @click="pick('guestbook')">Open guestbook</button>
      </div>
    </div>

    <div class="card">
      <h3>Integrations</h3>
      <p v-if="!cmsStatus" class="muted">Loading...</p>
      <ul v-else class="dash-list">
        <li v-for="s in cmsStatus.sources" :key="s.id" class="dash-row">
          <div class="dash-row-main">
            <b>{{ s.label }}</b>
            <span v-if="s.mock" class="pill">mock</span>
            <span v-if="!s.configured" class="muted">not configured</span>
            <span v-else-if="s.state === 'ok'" class="muted">OK, synced {{ ago(s.lastSuccessAt) }}</span>
            <span v-else-if="s.state === 'error'" class="dash-err">
              Error {{ ago(s.lastErrorAt) }}: {{ s.lastError }}
            </span>
            <span v-else class="muted">Never synced</span>
          </div>
          <button v-if="s.canSync" class="btn ghost" :disabled="syncing.includes(s.id)" @click="syncNow(s.id)">
            {{ syncing.includes(s.id) ? "Syncing..." : "Sync now" }}
          </button>
        </li>
      </ul>
    </div>

    <div class="card">
      <h3>Recent edits</h3>
      <p v-if="!cmsStatus" class="muted">Loading...</p>
      <p v-else-if="!cmsStatus.recentEdits.length" class="muted">No edits yet.</p>
      <ul v-else class="dash-list">
        <li v-for="r in cmsStatus.recentEdits" :key="r.id" class="dash-row">
          <span>{{ r.label }}</span>
          <span class="muted">{{ ago(r.savedAt) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: var(--sp-16);
}
.dash-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-12);
}
.dash-actions {
  display: flex;
  gap: var(--sp-10);
}
.dash-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--sp-16);
}
.dash-visits {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-12);
}
.dash-big {
  font-family: var(--f-d);
  font-size: 32px;
  color: var(--ink-strong);
}
.dash-sub {
  font-size: 12px;
  margin-top: var(--sp-6);
}
.dash-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.dash-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-12);
  padding: var(--sp-8) 0;
  border-top: 1px solid var(--line);
}
.dash-row:first-child {
  border-top: 0;
}
.dash-row-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-8);
  min-width: 0;
}
.dash-err {
  color: var(--danger-ink);
  word-break: break-word;
}
</style>
