<script setup lang="ts">
import type {
  GifAssetView,
  ImageAssetView,
  PlaytimeSource,
  PlaytimeView,
  PresenceView,
} from "@lg/core";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AssetPicture from "./AssetPicture.vue";
import { apiUrl, presenceMediaUrl } from "../lib/api";

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
    recent: {
      name: string;
      appId: number;
      minutes2Weeks: number;
      iconUrl?: string;
      accent?: string;
    }[];
  };
  /** The merged chart: Steam's fortnight plus everything Discord watched. `steam`
   *  above is still the raw feed — `playing` comes from it, and it stays the
   *  source of the "Playing now" crown. */
  playtime?: PlaytimeView[];
}>();

const POLL_MS = 25_000;

const view = ref<PresenceView | null>(null);
const loaded = ref(false);
/**
 * Unreachable is not offline.
 *
 * `status` falls back to "offline" when `view` is null, so a failed fetch used to
 * render "Offline" — a specific claim about a person, made from a network error.
 * This module is Life's anchor and the site's floor ("a visitor notices the thing
 * is alive"), and it depends on a third party, so its failure state has to say
 * something true rather than something confident.
 */
const unreachable = ref(false);
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
const customStatus = computed(
  () => cards.value.find((c) => c.category === "custom")?.title ?? "",
);
const activityCards = computed(() =>
  cards.value.filter((c) => c.category !== "custom" && c.title),
);

// Per-category source label + themed motion + accent (currentColor for the motif).
const CAT: Record<string, { src: string; motif: string; color: string }> = {
  music: { src: "Listening to Spotify", motif: "music", color: "#1db954" },
  game: { src: "Playing", motif: "game", color: "var(--live-ink)" },
  watching: { src: "Watching", motif: "watch", color: "#ff0000" },
  streaming: { src: "Streaming", motif: "stream", color: "#9146ff" },
};

const activities = computed(() => {
  const cs = activityCards.value;
  if (!cs) return null;
  const cats = cs.map((c) => CAT[c.category] ?? null).filter(Boolean);
  return cs.map((c, i) => ({
    title: c.title!,
    sub: c.subtitle ?? "",
    // Proxied through our server (privacy); falls back to a labelled tile when
    // the activity has no art (e.g. Valorant).
    art: presenceMediaUrl({ url: c.image || undefined, game: c.title }),
    src: cats[i]?.src ?? "",
    motif: cats[i]?.motif ?? "",
    color: cats[i]?.color ?? "",
  }));
});

// Prefer the live Discord avatar; fall back to the site portrait, then initials.
const discordAvatar = computed(() => view.value?.avatar);
const discordAvatarSrc = computed(() => presenceMediaUrl({ url: discordAvatar.value }));

const initials = computed(() => {
  const h = props.handle.replace(/^@/, "");
  const caps = h.match(/[A-Z0-9]/g);
  if (caps && caps.length >= 2) return caps.slice(0, 2).join("");
  return (props.name || h).slice(0, 2).toUpperCase();
});

// ── Steam half ──────────────────────────────────────────────────────────────
// The section exists if anything was played, from either half. It used to key off
// `steam.recent`, which is why a fortnight of non-Steam games rendered as nothing
// at all rather than as a list without Steam in it.
const hasSteam = computed(() => !!props.playtime?.length);
const playingAppId = computed(() => props.steam?.playing?.appId ?? null);

interface Game {
  name: string;
  /** Steam only. Absent means no store link — Discord gives a name and nothing else. */
  appId?: number;
  hours: number;
  label: string;
  pct: number;
  iconUrl?: string;
  iconSrc?: string;
  accent: string;
  playing: boolean;
  source: PlaytimeSource;
  /** False when the total is a floor rather than a measurement. */
  exact: boolean;
}
/**
 * Every game played, not just the Steam ones.
 *
 * `playtime` is the resolver's merge: Steam's fortnight where Steam has a number
 * (it counts hours Discord was closed), and hours observed from Discord presence
 * for everything else — which is the only place a non-Steam game was ever going to
 * come from, because nothing was watching them.
 *
 * The two aren't summed. Discord reports Steam games too, so adding them would
 * double-count every hour Steam already knows about.
 */
const steamGames = computed<Game[]>(() => {
  const played = props.playtime ?? [];
  const hoursOf = (m: number) => Math.round((m / 60) * 10) / 10;
  const total = played.reduce((s, g) => s + g.minutes / 60, 0) || 1;
  return played.map((g) => {
    const hours = hoursOf(g.minutes);
    return {
      name: g.name,
      ...(g.appId != null ? { appId: g.appId } : {}),
      hours,
      label: (hours % 1 === 0 ? hours : hours.toFixed(1)) + "h",
      pct: Math.max(2, Math.round((g.minutes / 60 / total) * 100)),
      ...(g.iconUrl ? { iconUrl: g.iconUrl, iconSrc: presenceMediaUrl({ url: g.iconUrl }) } : {}),
      // Sampled from the game's own icon at sync — imported, not assigned.
      // Neutral when the icon didn't load, or when there's no icon to sample
      // because Discord doesn't hand one over: a fallback, never a guess.
      accent: g.accent ?? "var(--surf-3)",
      playing: playingAppId.value != null && g.appId === playingAppId.value,
      source: g.source,
      exact: g.exact,
    };
  });
});
const featured = computed(() => steamGames.value[0] ?? null);
const others = computed(() => steamGames.value.slice(1));
const totalHours = computed(
  () => Math.round((props.playtime ?? []).reduce((s, g) => s + g.minutes / 60, 0) * 10) / 10,
);

/** True when any of it is a floor — an undated session we timed from first sight,
 *  or any observed game at all, since Discord only sees what it's running for. */
const anyObserved = computed(() => (props.playtime ?? []).some((g) => g.source === "observed"));
const iconGrad = (accent: string) =>
  `linear-gradient(135deg, ${accent}, var(--surf-3))`;
const storeUrl = (appId: number) =>
  `https://store.steampowered.com/app/${appId}`;

// ── polling ─────────────────────────────────────────────────────────────────
async function refresh() {
  try {
    const res = await fetch(apiUrl("/api/presence"), {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      view.value = (await res.json()) as PresenceView;
      unreachable.value = false;
    } else {
      unreachable.value = view.value === null;
    }
  } catch {
    // Keep the last snapshot on a hiccup — old-and-labelled beats blank. But if
    // there's never been one, say so instead of inventing a status.
    unreachable.value = view.value === null;
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
  <!-- Every class is pw-namespaced so the site's global .tile/.stat/.grid/.meta
       rules can't leak into the widget. -->
  <div v-if="live || hasSteam" class="pw">
    <!-- Discord profile (live; already filtered by the server) -->
    <div v-if="live" class="pw-unit">
      <div class="pw-who">
        <div class="pw-avatar">
          <img v-if="discordAvatarSrc" :src="discordAvatarSrc" alt="" class="pw-av" />
          <AssetPicture v-else-if="avatar" :view="avatar" class="pw-av" />
          <span v-else>{{ initials }}</span>
          <span class="pw-pip" :class="'pw-s-' + status" />
        </div>
        <div class="pw-idcol">
          <div class="pw-name">
            {{ name }}<span class="pw-handle">{{ handle }}</span>
          </div>
          <div class="pw-stat">
            <span v-if="unreachable" class="pw-lbl">Can't reach Discord</span>
            <span v-else class="pw-lbl">{{ statusLabel[status] }}</span>
            <span v-if="!loaded" class="pw-muted">· loading…</span>
            <span v-else-if="unreachable" class="pw-muted">· status unknown</span>
          </div>
          <div v-if="customStatus" class="pw-cstat">
            <span class="pw-q">“</span>{{ customStatus }}
          </div>
        </div>
      </div>

      <!-- current activity: themed motion, no fake progress bar -->
      <div v-if="activities?.length" class="pw-act">
        <template v-for="activity in activities" :key="activity.title">
          <div class="pw-actitem">
            <img
              v-if="activity.art"
              :src="activity.art"
              alt=""
              class="pw-art"
            />
            <span v-else class="pw-art pw-art-ph" />
            <div class="pw-abody">
              <span class="pw-src" :style="{ color: activity.color }">
                {{ activity.src }}
                <span class="pw-anim" :class="'pw-' + activity.motif">
                  <template v-if="activity.motif === 'music'"
                    ><i /><i /><i /><i /><i
                  /></template>
                  <template v-else-if="activity.motif === 'game'"
                    ><i /><i /><i /><i
                  /></template>
                  <template v-else-if="activity.motif === 'watch'"
                    ><i
                  /></template>
                  <template v-else-if="activity.motif === 'stream'"
                    ><b /><i /><i
                  /></template>
                </span>
              </span>
              <div class="pw-atitle">{{ activity.title }}</div>
              <div v-if="activity.sub" class="pw-asub">{{ activity.sub }}</div>
            </div>
          </div>
        </template>
      </div>
      <div v-else-if="loaded && status !== 'offline'" class="pw-act pw-off">
        No activity to display right now
      </div>
    </div>

    <!-- Steam: what I actually play (server-synced) -->
    <div v-if="hasSteam" class="pw-steam">
      <div class="pw-steam-h"><span class="pw-t">Recently played</span></div>
      <p class="pw-steam-cap">
        Share of {{ totalHours }} h in the last 2 weeks<template v-if="anyObserved">
          · non-Steam hours are what Discord saw, so they're a floor</template>
      </p>

      <component
        :is="featured?.appId != null ? 'a' : 'div'"
        v-if="featured"
        class="pw-feat"
        v-bind="
          featured.appId != null
            ? { href: storeUrl(featured.appId), target: '_blank', rel: 'noreferrer noopener' }
            : {}
        "
      >
        <span class="pw-crown">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" />
          </svg>
          <template v-if="featured.playing">Playing now</template>
          <template v-else>Most played</template>
        </span>
        <div class="pw-frow">
          <img
            v-if="featured.iconSrc"
            :src="featured.iconSrc"
            alt=""
            class="pw-ico"
          />
          <span
            v-else
            class="pw-ico"
            :style="{ background: iconGrad(featured.accent) }"
            >{{ featured.name.slice(0, 1) }}</span
          >
          <div>
            <div class="pw-fname">{{ featured.name }}</div>
            <div class="pw-fhrs">
              {{ featured.label }}<span class="pw-sh">{{ featured.pct }}%</span>
            </div>
          </div>
        </div>
        <div class="pw-lane">
          <span class="pw-fill" :style="{ width: featured.pct + '%', '--bar': featured.accent }" />
        </div>
      </component>

      <div class="pw-grid">
        <component
          :is="g.appId != null ? 'a' : 'div'"
          v-for="g in others"
          :key="g.name"
          class="pw-tile"
          v-bind="
            g.appId != null
              ? { href: storeUrl(g.appId), target: '_blank', rel: 'noreferrer noopener' }
              : {}
          "
        >
          <img v-if="g.iconSrc" :src="g.iconSrc" alt="" class="pw-ico" />
          <span
            v-else
            class="pw-ico"
            :style="{ background: iconGrad(g.accent) }"
            >{{ g.name.slice(0, 1) }}</span
          >
          <div class="pw-meta">
            <div class="pw-tn">
              {{ g.name
              }}<span v-if="g.playing" class="pw-playing" title="Playing now" />
            </div>
            <div class="pw-row">
              <span class="pw-lane"
                ><span class="pw-fill" :style="{ width: g.pct + '%', '--bar': g.accent }"
              /></span>
              <span class="pw-hrs">{{ g.label }}</span>
            </div>
          </div>
        </component>
      </div>
    </div>
  </div>

  <p v-else class="pw-muted pw-np">Presence isn't configured.</p>
</template>

<style scoped>
.pw {
  background: linear-gradient(180deg, var(--surf-2), var(--surf-1) 46%);
  border: 1px solid var(--line-1);
  border-radius: var(--r-card);
  padding: var(--sp-18);
  box-shadow: var(--sh-card);
}

/* profile panel */
.pw-unit {
  border-radius: var(--r-card);
  background: var(--surf-2);
  border: 1px solid var(--line-1);
  overflow: hidden;
}
.pw-who {
  display: flex;
  gap: var(--sp-12);
  align-items: center;
  padding: 13px;
}
.pw-avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  flex: none;
  position: relative;
  display: grid;
  place-items: center;
  font-family: var(--f-d);
  font-weight: 700;
  font-size: 16px;
  color: #fff;
  background: linear-gradient(140deg, var(--ink), var(--surf-3));
  box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.6);
}
.pw-av {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}
.pw-avatar :deep(picture) {
  position: absolute;
  inset: 0;
}
.pw-avatar :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}
.pw-pip {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 3px solid var(--surf-2);
  display: grid;
  place-items: center;
  background: var(--muted);
}
.pw-pip.pw-s-online {
  background: var(--discord-online);
}
.pw-pip.pw-s-online::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid var(--discord-online);
  opacity: 0.5;
  animation: pw-ping 2.6s cubic-bezier(0.2, 0.7, 0.3, 1) infinite;
}
.pw-pip.pw-s-idle {
  background: var(--discord-idle);
  animation: pw-breathe 2.6s ease-in-out infinite;
}
.pw-pip.pw-s-dnd {
  background: var(--discord-dnd);
}
.pw-pip.pw-s-dnd::before {
  content: "";
  width: 56%;
  height: 2.5px;
  border-radius: 2px;
  background: var(--surf-2);
}
.pw-pip.pw-s-offline {
  background: transparent;
  border-color: var(--surf-2);
  box-shadow: inset 0 0 0 2px var(--muted);
}

.pw-idcol {
  min-width: 0;
  flex: 1;
}
.pw-name {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: 15px;
  color: var(--ink-strong);
  line-height: 1.15;
}
.pw-handle {
  font-family: var(--f-m);
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
  margin-left: var(--sp-4);
}
.pw-stat {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
  font-size: 11px;
  color: var(--muted);
  margin-top: var(--sp-2);
}
.pw-lbl {
  font-weight: 600;
}
.pw-cstat {
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.35;
  margin-top: 5px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pw-q {
  font-family: var(--f-d);
  color: color-mix(in srgb, var(--ink) 65%, var(--muted));
  margin-right: 1px;
}

/* activity */
.pw-act {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 11px 13px;
  border-top: 1px solid var(--line-1);
}
/* One activity = an icon-left / text-right row, matching the profile row and the
   Steam tiles above. (The art used to stack above the text because this wrapper
   had no layout of its own.) */
.pw-actitem {
  display: flex;
  gap: 11px;
  align-items: center;
  min-width: 0;
}
.pw-art {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex: none;
  object-fit: cover;
  box-shadow: 0 5px 12px -6px rgba(0, 0, 0, 0.55);
}
.pw-art-ph {
  background: linear-gradient(135deg, var(--ink), var(--surf-3));
}
.pw-abody {
  min-width: 0;
  flex: 1;
}
.pw-src {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--f-m);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.pw-atitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-asub {
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-off {
  color: var(--muted);
  font-size: 12px;
  justify-content: center;
  padding: 13px;
}

/* themed motion — inherits currentColor from .pw-src */
.pw-anim {
  flex: none;
  color: inherit;
}
.pw-music {
  display: inline-flex;
  align-items: flex-end;
  gap: 2.5px;
  height: 12px;
}
.pw-music i {
  width: 2.5px;
  border-radius: 2px;
  background: currentColor;
  height: 35%;
  animation: pw-eq 0.95s ease-in-out infinite;
}
.pw-music i:nth-child(2) {
  animation-delay: 0.18s;
}
.pw-music i:nth-child(3) {
  animation-delay: 0.42s;
}
.pw-music i:nth-child(4) {
  animation-delay: 0.1s;
}
.pw-music i:nth-child(5) {
  animation-delay: 0.33s;
}
.pw-game {
  position: relative;
  width: 14px;
  height: 14px;
}
.pw-game i {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 1.5px;
  background: currentColor;
  opacity: 0.28;
  animation: pw-dpad 1.6s steps(1, end) infinite;
}
.pw-game i:nth-child(1) {
  top: 0;
  left: 5px;
  animation-delay: 0s;
}
.pw-game i:nth-child(2) {
  top: 5px;
  right: 0;
  animation-delay: 0.4s;
}
.pw-game i:nth-child(3) {
  bottom: 0;
  left: 5px;
  animation-delay: 0.8s;
}
.pw-game i:nth-child(4) {
  top: 5px;
  left: 0;
  animation-delay: 1.2s;
}
.pw-watch {
  position: relative;
  width: 16px;
  height: 12px;
}
.pw-watch::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1.5px;
  margin-top: -0.75px;
  background: currentColor;
  opacity: 0.3;
  border-radius: 2px;
}
.pw-watch i {
  position: absolute;
  top: 50%;
  margin-top: -var(--sp-2);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  animation: pw-scrub 1.9s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
.pw-stream {
  position: relative;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
}
.pw-stream b {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  z-index: 1;
}
.pw-stream i {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  animation: pw-cast 1.7s ease-out infinite;
}
.pw-stream i:nth-child(3) {
  animation-delay: 0.85s;
}
@keyframes pw-eq {
  0%,
  100% {
    height: 28%;
  }
  50% {
    height: 100%;
  }
}
@keyframes pw-dpad {
  0%,
  25%,
  100% {
    opacity: 0.28;
  }
  6%,
  19% {
    opacity: 1;
  }
}
@keyframes pw-scrub {
  0% {
    left: 0;
  }
  50% {
    left: 12px;
  }
  100% {
    left: 0;
  }
}
@keyframes pw-cast {
  0% {
    width: 4px;
    height: 4px;
    opacity: 0.75;
  }
  100% {
    width: 16px;
    height: 16px;
    opacity: 0;
  }
}
@keyframes pw-ping {
  0% {
    transform: scale(0.7);
    opacity: 0.55;
  }
  70%,
  100% {
    transform: scale(1.75);
    opacity: 0;
  }
}
@keyframes pw-breathe {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}

/* steam */
.pw-steam {
  margin-top: var(--sp-16);
}
.pw-steam-h {
  margin: var(--sp-2) var(--sp-2) 3px;
}
.pw-t {
  font-family: var(--f-m);
  font-size: 11px;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--muted);
}
.pw-steam-cap {
  font-size: 10.5px;
  color: var(--muted);
  margin: 0 var(--sp-2) var(--sp-12);
}
.pw-ico {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  object-fit: cover;
  font-family: var(--f-d);
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  box-shadow: 0 6px 14px -8px rgba(0, 0, 0, 0.5);
}

.pw-feat {
  display: block;
  position: relative;
  padding: var(--sp-14);
  border-radius: var(--r-card);
  margin-bottom: 11px;
  border: 1px solid var(--line-1);
  text-decoration: none;
  overflow: hidden;
  background: linear-gradient(135deg, var(--surf-2), var(--surf-1));
  transition: transform 0.16s ease;
}
.pw-feat:hover {
  transform: translateY(-2px);
}
.pw-crown {
  position: absolute;
  top: 12px;
  right: 13px;
  font-family: var(--f-m);
  font-size: 9.5px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 5px;
}
.pw-crown svg {
  width: 12px;
  height: 12px;
}
.pw-frow {
  display: flex;
  gap: var(--sp-12);
  align-items: center;
}
.pw-fname {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-strong);
}
.pw-fhrs {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: 24px;
  color: var(--ink-strong);
  line-height: 1;
  margin-top: 3px;
}
.pw-sh {
  font-family: var(--f-m);
  font-size: 11px;
  color: var(--muted);
  margin-left: 7px;
}
.pw-feat .pw-lane {
  height: 6px;
  border-radius: 6px;
  background: color-mix(in srgb, #000 26%, transparent);
  margin-top: var(--sp-12);
  overflow: hidden;
}
.pw-feat .pw-fill {
  background: linear-gradient(
    90deg,
    var(--ink),
    color-mix(in srgb, var(--ink) 45%, #fff)
  );
}

.pw-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-10);
}
.pw-tile {
  display: flex;
  gap: var(--sp-10);
  align-items: center;
  min-width: 0;
  padding: var(--sp-10);
  border-radius: 14px;
  background: var(--surf-2);
  border: 1px solid var(--line-1);
  text-decoration: none;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease;
}
.pw-tile:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 26px -16px rgba(0, 0, 0, 0.6);
}
.pw-tile .pw-ico {
  width: 32px;
  height: 32px;
  font-size: 14px;
}
.pw-meta {
  min-width: 0;
  flex: 1;
}
.pw-tn {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-playing {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink);
  margin-left: var(--sp-6);
  animation: pw-breathe 1.8s ease-in-out infinite;
}
.pw-row {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: var(--sp-6);
}
.pw-lane {
  height: 4px;
  flex: 1;
  border-radius: 4px;
  background: var(--track);
  overflow: hidden;
}
.pw-fill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--bar, var(--live));
}
.pw-hrs {
  font-family: var(--f-m);
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
}

.pw-muted {
  color: var(--muted);
}
.pw-np {
  font-size: 13px;
}

@media (prefers-reduced-motion: reduce) {
  .pw-anim i,
  .pw-anim b,
  .pw-pip::after,
  .pw-pip,
  .pw-playing {
    animation: none !important;
  }
  .pw-feat,
  .pw-tile {
    transition: none !important;
  }
}
@media (max-width: 380px) {
  .pw-grid {
    grid-template-columns: 1fr;
  }
}
</style>
