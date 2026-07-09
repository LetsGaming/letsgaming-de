<script setup lang="ts">
import type { ImageAssetView, GifAssetView, PresenceView } from "@lg/core";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AssetPicture from "./AssetPicture.vue";

// The client only ever knows whether to poll, the owner identity for the profile
// header, and the (already-gated) Steam data. It never receives the Discord id,
// the category list, or any disabled activity — the server filters before this.
const props = defineProps<{
  live: boolean;
  name: string;
  handle: string;
  avatar?: ImageAssetView | GifAssetView;
  steam?: {
    playing?: { name: string; appId: number };
    recent: { name: string; appId: number; minutes2Weeks: number; iconUrl?: string }[];
  };
}>();

const API_BASE = (import.meta.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");
const POLL_MS = 25_000;

const view = ref<PresenceView | null>(null);
const loaded = ref(false);
let poll: ReturnType<typeof setInterval> | null = null;

// ── Discord half ────────────────────────────────────────────────────────────
const status = computed(() => view.value?.status ?? "offline");
const statusLabel: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
  offline: "Offline",
};

const cards = computed(() => view.value?.cards ?? []);
// The custom status is a small line under the name; the activity is a card.
const customStatus = computed(() => cards.value.find((c) => c.category === "custom")?.title ?? "");
const activityCard = computed(() => cards.value.find((c) => c.category !== "custom") ?? null);

// Per-category source label + themed motion + accent (currentColor for the motif).
const CAT: Record<string, { src: string; motif: string; color: string }> = {
  music: { src: "Listening to Spotify", motif: "music", color: "var(--mint)" },
  game: { src: "Playing", motif: "game", color: "var(--purple-br)" },
  watching: { src: "Watching", motif: "watch", color: "var(--coral)" },
  streaming: { src: "Streaming", motif: "stream", color: "var(--purple-br)" },
};
const activity = computed(() => {
  const c = activityCard.value;
  if (!c) return null;
  const cat = CAT[c.category] ?? CAT.game;
  return { ...cat, title: c.title, sub: c.subtitle, image: c.image };
});

const initials = computed(() => {
  const h = props.handle.replace(/^@/, "");
  const caps = h.match(/[A-Z0-9]/g);
  if (caps && caps.length >= 2) return caps.slice(0, 2).join("");
  return (props.name || h).slice(0, 2).toUpperCase();
});

// ── Steam half ──────────────────────────────────────────────────────────────
const ACCENTS = ["var(--purple)", "var(--coral)", "var(--mint)", "var(--purple-br)"];
const hasSteam = computed(() => !!props.steam?.recent.length);
const playingAppId = computed(() => props.steam?.playing?.appId ?? null);

interface Game {
  name: string;
  appId: number;
  hours: number;
  label: string;
  pct: number;
  iconUrl?: string;
  accent: string;
  playing: boolean;
}
const steamGames = computed<Game[]>(() => {
  const recent = props.steam?.recent ?? [];
  const hoursOf = (m: number) => Math.round((m / 60) * 10) / 10;
  const total = recent.reduce((s, g) => s + g.minutes2Weeks / 60, 0) || 1;
  return recent.map((g, i) => {
    const hours = hoursOf(g.minutes2Weeks);
    return {
      name: g.name,
      appId: g.appId,
      hours,
      label: (hours % 1 === 0 ? hours : hours.toFixed(1)) + "h",
      // share of the fortnight's total, floored so a tiny one still shows
      pct: Math.max(2, Math.round((g.minutes2Weeks / 60 / total) * 100)),
      ...(g.iconUrl ? { iconUrl: g.iconUrl } : {}),
      accent: ACCENTS[i % ACCENTS.length]!,
      playing: playingAppId.value != null && g.appId === playingAppId.value,
    };
  });
});
const featured = computed(() => steamGames.value[0] ?? null);
const others = computed(() => steamGames.value.slice(1));
const totalHours = computed(() =>
  Math.round(((props.steam?.recent ?? []).reduce((s, g) => s + g.minutes2Weeks / 60, 0)) * 10) / 10,
);
const iconGrad = (accent: string) => `linear-gradient(135deg, ${accent}, var(--purple-d))`;
const storeUrl = (appId: number) => `https://store.steampowered.com/app/${appId}`;

// ── polling ─────────────────────────────────────────────────────────────────
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
  }
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
});
</script>

<template>
  <div v-if="live || hasSteam" class="presence">
    <!-- Discord profile (live; already filtered by the server) -->
    <div v-if="live" class="unit">
      <div class="who">
        <div class="avatar">
          <AssetPicture v-if="avatar" :view="avatar" class="av-img" />
          <span v-else>{{ initials }}</span>
          <span class="pip" :class="'s-' + status" />
        </div>
        <div class="idcol">
          <div class="name">{{ name }}<span class="handle">{{ handle }}</span></div>
          <div class="stat">
            <span class="lbl">{{ statusLabel[status] }}</span>
            <span v-if="!loaded" class="muted">· loading…</span>
          </div>
          <div v-if="customStatus" class="cstat"><span class="q">“</span>{{ customStatus }}</div>
        </div>
      </div>

      <!-- current activity: themed motion, no fake progress bar -->
      <div v-if="activity" class="act">
        <img v-if="activity.image" :src="activity.image" alt="" class="art" />
        <span v-else class="art art-ph" />
        <div class="abody">
          <span class="src" :style="{ color: activity.color }">
            {{ activity.src }}
            <span class="anim" :class="activity.motif">
              <template v-if="activity.motif === 'music'"><i /><i /><i /><i /><i /></template>
              <template v-else-if="activity.motif === 'game'"><i /><i /><i /><i /></template>
              <template v-else-if="activity.motif === 'watch'"><i /></template>
              <template v-else-if="activity.motif === 'stream'"><b /><i /><i /></template>
            </span>
          </span>
          <div class="atitle">{{ activity.title }}</div>
          <div v-if="activity.sub" class="asub">{{ activity.sub }}</div>
        </div>
      </div>
      <div v-else-if="loaded && status !== 'offline'" class="act off">Not in an app right now</div>
    </div>

    <!-- Steam: what I actually play (server-synced) -->
    <div v-if="hasSteam" class="steam">
      <div class="steam-h"><span class="t">Recently on Steam</span></div>
      <p class="steam-cap">Share of {{ totalHours }} h played in the last 2 weeks</p>

      <a v-if="featured" class="feat" :href="storeUrl(featured.appId)" target="_blank" rel="noreferrer noopener">
        <span class="crown">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" /></svg>
          <template v-if="featured.playing">Playing now</template>
          <template v-else>Most played</template>
        </span>
        <div class="frow">
          <img v-if="featured.iconUrl" :src="featured.iconUrl" alt="" class="ico" />
          <span v-else class="ico" :style="{ background: iconGrad(featured.accent) }">{{ featured.name.slice(0, 1) }}</span>
          <div>
            <div class="fname">{{ featured.name }}</div>
            <div class="fhrs">{{ featured.label }}<span class="sh">{{ featured.pct }}%</span></div>
          </div>
        </div>
        <div class="lane"><span class="fill" :style="{ width: featured.pct + '%' }" /></div>
      </a>

      <div class="grid">
        <a v-for="g in others" :key="g.appId" class="tile" :href="storeUrl(g.appId)" target="_blank" rel="noreferrer noopener">
          <img v-if="g.iconUrl" :src="g.iconUrl" alt="" class="ico" />
          <span v-else class="ico" :style="{ background: iconGrad(g.accent) }">{{ g.name.slice(0, 1) }}</span>
          <div class="meta">
            <div class="tn">{{ g.name }}<span v-if="g.playing" class="playing" title="Playing now" /></div>
            <div class="row">
              <span class="lane"><span class="fill" :style="{ width: g.pct + '%' }" /></span>
              <span class="hrs">{{ g.label }}</span>
            </div>
          </div>
        </a>
      </div>
    </div>
  </div>

  <p v-else class="muted np">Presence isn't configured.</p>
</template>

<style scoped>
.presence {
  background: linear-gradient(180deg, var(--card-2), var(--card) 46%);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 18px;
  box-shadow: var(--sh-1);
  max-width: 440px;
}

/* profile panel */
.unit { border-radius: var(--r-sm); background: var(--card-2); border: 1px solid var(--line); overflow: hidden; }
.who { display: flex; gap: 12px; align-items: center; padding: 13px; }
.avatar {
  width: 46px; height: 46px; border-radius: 50%; flex: none; position: relative;
  display: grid; place-items: center; font-family: var(--f-d); font-weight: 700; font-size: 16px; color: #fff;
  background: linear-gradient(140deg, var(--purple-br), var(--purple-d));
  box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.6);
}
.avatar :deep(picture), .av-img { position: absolute; inset: 0; }
.avatar :deep(img) { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.pip { position: absolute; right: -1px; bottom: -1px; width: 15px; height: 15px; border-radius: 50%; border: 3px solid var(--card-2); display: grid; place-items: center; background: var(--muted); }
.pip.s-online { background: var(--mint); }
.pip.s-online::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--mint); opacity: .5; animation: ping 2.6s cubic-bezier(.2, .7, .3, 1) infinite; }
.pip.s-idle { background: var(--sun); animation: breathe 2.6s ease-in-out infinite; }
.pip.s-dnd { background: var(--coral); }
.pip.s-dnd::before { content: ""; width: 56%; height: 2.5px; border-radius: 2px; background: var(--card-2); }
.pip.s-offline { background: transparent; border-color: var(--card-2); box-shadow: inset 0 0 0 2px var(--muted); }

.idcol { min-width: 0; flex: 1; }
.name { font-family: var(--f-d); font-weight: 600; font-size: 15px; color: var(--ink-strong); line-height: 1.15; }
.name .handle { font-family: var(--f-m); font-size: 11px; font-weight: 400; color: var(--muted); margin-left: 4px; }
.stat { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); margin-top: 2px; }
.stat .lbl { font-weight: 600; }
.cstat { font-size: 11.5px; color: var(--muted); line-height: 1.35; margin-top: 5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cstat .q { font-family: var(--f-d); color: color-mix(in srgb, var(--purple-br) 65%, var(--muted)); margin-right: 1px; }

/* activity */
.act { display: flex; gap: 11px; align-items: center; padding: 11px 13px; border-top: 1px solid var(--line); }
.act .art { width: 40px; height: 40px; border-radius: 10px; flex: none; object-fit: cover; box-shadow: 0 5px 12px -6px rgba(0, 0, 0, 0.55); }
.act .art-ph { background: linear-gradient(135deg, var(--purple), var(--purple-d)); }
.abody { min-width: 0; flex: 1; }
.src { display: inline-flex; align-items: center; gap: 7px; font-family: var(--f-m); font-size: 10px; letter-spacing: .05em; text-transform: uppercase; }
.atitle { font-size: 13px; font-weight: 600; color: var(--ink); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.asub { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.act.off { color: var(--muted); font-size: 12px; justify-content: center; padding: 13px; }

/* themed motion — inherits currentColor from .src */
.anim { flex: none; color: inherit; }
.anim.music { display: inline-flex; align-items: flex-end; gap: 2.5px; height: 12px; }
.anim.music i { width: 2.5px; border-radius: 2px; background: currentColor; height: 35%; animation: eq .95s ease-in-out infinite; }
.anim.music i:nth-child(2) { animation-delay: .18s; } .anim.music i:nth-child(3) { animation-delay: .42s; }
.anim.music i:nth-child(4) { animation-delay: .1s; } .anim.music i:nth-child(5) { animation-delay: .33s; }
.anim.game { position: relative; width: 14px; height: 14px; }
.anim.game i { position: absolute; width: 4px; height: 4px; border-radius: 1.5px; background: currentColor; opacity: .28; animation: dpad 1.6s steps(1, end) infinite; }
.anim.game i:nth-child(1) { top: 0; left: 5px; animation-delay: 0s; }
.anim.game i:nth-child(2) { top: 5px; right: 0; animation-delay: .4s; }
.anim.game i:nth-child(3) { bottom: 0; left: 5px; animation-delay: .8s; }
.anim.game i:nth-child(4) { top: 5px; left: 0; animation-delay: 1.2s; }
.anim.watch { position: relative; width: 16px; height: 12px; }
.anim.watch::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 1.5px; margin-top: -.75px; background: currentColor; opacity: .3; border-radius: 2px; }
.anim.watch i { position: absolute; top: 50%; margin-top: -2px; width: 4px; height: 4px; border-radius: 50%; background: currentColor; animation: scrub 1.9s cubic-bezier(.45, 0, .55, 1) infinite; }
.anim.stream { position: relative; width: 16px; height: 16px; display: grid; place-items: center; }
.anim.stream b { width: 4px; height: 4px; border-radius: 50%; background: currentColor; z-index: 1; }
.anim.stream i { position: absolute; width: 4px; height: 4px; border-radius: 50%; border: 1.5px solid currentColor; animation: cast 1.7s ease-out infinite; }
.anim.stream i:nth-child(3) { animation-delay: .85s; }
@keyframes eq { 0%, 100% { height: 28%; } 50% { height: 100%; } }
@keyframes dpad { 0%, 25%, 100% { opacity: .28; } 6%, 19% { opacity: 1; } }
@keyframes scrub { 0% { left: 0; } 50% { left: 12px; } 100% { left: 0; } }
@keyframes cast { 0% { width: 4px; height: 4px; opacity: .75; } 100% { width: 16px; height: 16px; opacity: 0; } }
@keyframes ping { 0% { transform: scale(.7); opacity: .55; } 70%, 100% { transform: scale(1.75); opacity: 0; } }
@keyframes breathe { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }

/* steam */
.steam { margin-top: 16px; }
.steam-h { margin: 2px 2px 3px; }
.steam-h .t { font-family: var(--f-m); font-size: 11px; letter-spacing: .11em; text-transform: uppercase; color: var(--muted); }
.steam-cap { font-size: 10.5px; color: var(--muted); margin: 0 2px 12px; }
.ico { flex: none; width: 46px; height: 46px; border-radius: 10px; display: grid; place-items: center; object-fit: cover; font-family: var(--f-d); font-weight: 600; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .35); box-shadow: 0 6px 14px -8px rgba(0, 0, 0, .5); }

.feat { display: block; position: relative; padding: 14px; border-radius: var(--r-sm); margin-bottom: 11px; border: 1px solid var(--line); text-decoration: none; overflow: hidden; background: linear-gradient(135deg, var(--purple-wash), var(--card)); transition: transform .16s ease; }
.feat:hover { transform: translateY(-2px); }
.feat .crown { position: absolute; top: 12px; right: 13px; font-family: var(--f-m); font-size: 9.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--purple-br); display: flex; align-items: center; gap: 5px; }
.feat .crown svg { width: 12px; height: 12px; }
.feat .frow { display: flex; gap: 12px; align-items: center; }
.feat .fname { font-size: 14px; font-weight: 600; color: var(--ink-strong); }
.feat .fhrs { font-family: var(--f-d); font-weight: 600; font-size: 24px; color: var(--ink-strong); line-height: 1; margin-top: 3px; }
.feat .fhrs .sh { font-family: var(--f-m); font-size: 11px; color: var(--muted); margin-left: 7px; }
.feat .lane { height: 6px; border-radius: 6px; background: color-mix(in srgb, #000 26%, transparent); margin-top: 12px; overflow: hidden; }
.feat .fill { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, var(--purple-br), color-mix(in srgb, var(--purple-br) 45%, #fff)); }

.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.tile { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 14px; background: var(--card-2); border: 1px solid var(--line); text-decoration: none; transition: transform .16s ease, box-shadow .16s ease; }
.tile:hover { transform: translateY(-3px); box-shadow: 0 14px 26px -16px rgba(0, 0, 0, .6); }
.tile .ico { width: 32px; height: 32px; font-size: 14px; }
.tile .meta { min-width: 0; flex: 1; }
.tile .tn { font-size: 12px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile .playing { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--mint); margin-left: 6px; vertical-align: middle; animation: breathe 1.8s ease-in-out infinite; }
.tile .row { display: flex; align-items: center; gap: 7px; margin-top: 6px; }
.tile .lane { height: 4px; flex: 1; border-radius: 4px; background: var(--lang-track); overflow: hidden; }
.tile .fill { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--purple), var(--purple-br)); }
.tile .hrs { font-family: var(--f-m); font-size: 10px; color: var(--muted); white-space: nowrap; }

.muted { color: var(--muted); }
.np { font-size: 13px; }

@media (prefers-reduced-motion: reduce) {
  .anim i, .anim b, .pip::after, .pip, .playing { animation: none !important; }
  .feat, .tile { transition: none !important; }
}
@media (max-width: 380px) { .grid { grid-template-columns: 1fr; } }
</style>
