<script setup lang="ts">
import type { PresenceView } from "@lg/core";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

// The client only ever knows whether to poll and the (already-gated) Steam data.
// It never receives the Discord id, the category list, or any disabled activity —
// the server filters everything before it reaches here.
const props = defineProps<{
  live: boolean;
  steam?: {
    playing?: { name: string; appId: number };
    recent: { name: string; appId: number; minutes2Weeks: number; iconUrl?: string }[];
  };
}>();

const API_BASE = (import.meta.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");
const POLL_MS = 25_000;

const view = ref<PresenceView | null>(null);
const loaded = ref(false);
const now = ref(Date.now());

let poll: ReturnType<typeof setInterval> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;

const hasSteam = computed(() => !!props.steam?.recent.length);

const statusLabel: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
  offline: "Offline",
};

function elapsed(since?: number): string {
  if (!since) return "";
  const s = Math.max(0, Math.floor((now.value - since) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

async function refresh() {
  try {
    const res = await fetch(`${API_BASE}/api/presence`, { headers: { Accept: "application/json" } });
    if (res.ok) view.value = (await res.json()) as PresenceView;
  } catch {
    /* keep the last snapshot on a hiccup */
  } finally {
    loaded.value = true;
  }
}

onMounted(() => {
  if (props.live) {
    void refresh();
    poll = setInterval(refresh, POLL_MS);
    ticker = setInterval(() => (now.value = Date.now()), 30_000);
  }
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  if (ticker) clearInterval(ticker);
});
</script>

<template>
  <div class="presence">
    <!-- Live Discord status + activities - already filtered by the server. -->
    <div v-if="live" class="pr-live">
      <div class="pr-status">
        <span class="dot" :class="'s-' + (view?.status ?? 'offline')" />
        {{ statusLabel[view?.status ?? "offline"] }}
        <span v-if="!loaded" class="muted">· loading…</span>
      </div>
      <div v-if="view?.cards.length" class="pr-cards">
        <div v-for="(c, i) in view.cards" :key="i" class="pr-card" :class="'c-' + c.category">
          <img v-if="c.image" :src="c.image" alt="" class="pr-img" />
          <div class="pr-text">
            <div class="pr-title">{{ c.title }}</div>
            <div v-if="c.subtitle" class="pr-sub">{{ c.subtitle }}</div>
          </div>
          <span v-if="c.since" class="pr-since">{{ elapsed(c.since) }}</span>
        </div>
      </div>
      <p v-else-if="loaded" class="muted pr-idle">Not up to anything right now.</p>
    </div>

    <!-- Steam: what I actually play (server-synced; only present if enabled). -->
    <div v-if="hasSteam" class="pr-steam">
      <h3>Recently on Steam</h3>
      <div v-if="steam?.playing" class="pr-nowplaying">In game: <b>{{ steam.playing.name }}</b></div>
      <ul>
        <li v-for="g in steam!.recent" :key="g.appId">
          <img v-if="g.iconUrl" :src="g.iconUrl" alt="" class="pr-gicon" />
          <a :href="`https://store.steampowered.com/app/${g.appId}`" target="_blank" rel="noreferrer noopener">{{ g.name }}</a>
          <span class="muted">{{ Math.round(g.minutes2Weeks / 60 * 10) / 10 }}h / 2 wks</span>
        </li>
      </ul>
    </div>

    <p v-if="!live && !hasSteam" class="muted">Presence isn't configured.</p>
  </div>
</template>

<style scoped>
.presence { display: flex; flex-direction: column; gap: 18px; max-width: 620px; }
.pr-status { display: flex; align-items: center; gap: 8px; font-family: var(--f-m); font-size: 13px; color: var(--ink-strong); margin-bottom: 12px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); }
.dot.s-online { background: #43b581; }
.dot.s-idle { background: #faa61a; }
.dot.s-dnd { background: #f04747; }
.dot.s-offline { background: var(--muted); }
.pr-cards { display: flex; flex-direction: column; gap: 10px; }
.pr-card { display: flex; align-items: center; gap: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }
.pr-img { width: 44px; height: 44px; border-radius: 9px; object-fit: cover; flex: none; }
.pr-text { min-width: 0; }
.pr-title { font-size: 14px; color: var(--ink-strong); font-weight: 600; }
.pr-sub { font-size: 12px; color: var(--muted); }
.pr-since { margin-left: auto; font-family: var(--f-m); font-size: 11px; color: var(--muted); white-space: nowrap; }
.pr-idle { font-size: 13px; }
.pr-steam h3 { font-size: 15px; color: var(--ink-strong); margin-bottom: 8px; }
.pr-nowplaying { font-size: 13px; color: var(--ink); margin-bottom: 8px; }
.pr-steam ul { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.pr-steam li { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.pr-steam li a { color: var(--purple-br); text-decoration: none; }
.pr-steam li a:hover { text-decoration: underline; }
.pr-steam li .muted { margin-left: auto; font-family: var(--f-m); font-size: 11px; }
.pr-gicon { width: 18px; height: 18px; border-radius: 4px; flex: none; }
.muted { color: var(--muted); }
</style>
