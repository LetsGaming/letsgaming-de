<script setup lang="ts">
/**
 * Inspector block for modules fed by a sync or derived from other data: where the data
 * comes from, when it last arrived, and a Sync now button when the source supports it.
 * Modules with their own settings render those below this (see EditorPanel).
 */
import { computed, onMounted, ref, watch } from "vue";
import type { ModuleKind } from "@lg/core";
import { useCmsContext } from "../../composables/cmsContext";
import { type CmsSourceStatus } from "../../lib/cms";
import { SYNCED_INFO, formatDateTime } from "../../lib/cmsInspector";

const props = defineProps<{ kind: ModuleKind }>();
const { cms, flash, refreshCanvas, pick } = useCmsContext();

const info = computed(() => SYNCED_INFO[props.kind]);
const sources = ref<CmsSourceStatus[]>([]);
const failed = ref(false);
const syncing = ref(false);
const tag = typeof navigator === "undefined" ? undefined : navigator.language;

const source = computed(() => sources.value.find((s) => s.id === info.value?.source) ?? null);
const stateText = computed(() => {
  const s = source.value;
  if (!s) return "";
  if (s.state === "error") return `Last sync failed${s.lastError ? `: ${s.lastError}` : ""}`;
  if (s.state === "never") return "Not synced yet";
  return "Up to date";
});

async function load() {
  try {
    sources.value = (await cms.status()).sources;
    failed.value = false;
  } catch {
    failed.value = true;
  }
}

async function syncNow() {
  const s = source.value;
  if (!s || syncing.value) return;
  syncing.value = true;
  try {
    const run = await cms.syncSource(s.id);
    flash(run.ok ? `${s.label} synced` : `${s.label} sync failed${run.error ? `: ${run.error}` : ""}`);
    await Promise.all([load(), refreshCanvas()]);
  } catch (e) {
    flash(e instanceof Error ? e.message : "Sync failed");
  } finally {
    syncing.value = false;
  }
}

onMounted(load);
watch(() => props.kind, load);
</script>

<template>
  <div v-if="info" class="synced">
    <p class="help">{{ info.from }}</p>

    <dl v-if="source" class="syncmeta">
      <dt>Source</dt>
      <dd>{{ source.label }}<span v-if="source.mock" class="muted"> (mock data)</span></dd>
      <dt>Last sync</dt>
      <dd>{{ formatDateTime(source.lastSuccessAt, tag) }}</dd>
      <dt>Status</dt>
      <dd :class="{ bad: source.state === 'error' }">{{ stateText }}</dd>
    </dl>
    <p v-else-if="info.source && failed" class="help">Sync status is unavailable right now.</p>

    <button v-if="source?.canSync" class="btn" :disabled="syncing" @click="syncNow">
      {{ syncing ? "Syncing…" : "Sync now" }}
    </button>
    <p v-else-if="source" class="help">This source updates itself on a schedule.</p>

    <button v-if="info.settingsLink" class="link" @click="pick('settings')">Presence privacy is in Settings</button>
  </div>
</template>

<style scoped>
.synced {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-8);
}
.syncmeta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--sp-4) var(--sp-12);
  margin: 0;
  font-size: 13px;
}
.syncmeta dt {
  color: var(--muted);
}
.syncmeta dd {
  margin: 0;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.syncmeta .bad {
  color: var(--danger-ink);
}
</style>
