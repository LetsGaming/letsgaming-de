<script setup lang="ts">
import type { GifAssetView, ImageAssetView, MessageKey } from "@lg/core";
import { computed } from "vue";
import AssetPicture from "../ui/AssetPicture.vue";
import { presenceMediaUrl } from "../../lib/api";
import { usePresence } from "../../composables/usePresence";
import { useT } from "~/composables/useT";

// The client only ever knows whether presence is enabled (a CMS display toggle)
// and the owner identity for the profile header. It never receives the Discord
// id, the category list, any disabled activity, or the playtime history, the
// server filters before this, and history lives in the playtime module now.
const props = defineProps<{
  enabled: boolean;
  name: string;
  handle: string;
  avatar?: ImageAssetView | GifAssetView;
}>();

// Fetching + the poll loop live in the composable (a component doesn't fetch);
// this component only renders whatever the server returns. `unreachable` stays an
// honest "couldn't reach the relay, never had a snapshot", a successful *offline*
// response is a real fact and renders as its own state below.
const { view, loaded, unreachable } = usePresence(() => props.enabled);

// ── Discord half ────────────────────────────────────────────────────────────
const { t } = useT();

const status = computed(() => view.value?.status ?? "offline");
// Keys, not English. This widget was the last untranslated public surface: a
// dozen strings, several of them the only thing shown while the relay is down.
const STATUS_LABEL: Record<string, MessageKey> = {
  online: "presenceOnline",
  idle: "presenceIdle",
  dnd: "presenceDnd",
  offline: "presenceOffline",
};

const cards = computed(() => view.value?.cards ?? []);
const customStatus = computed(
  () => cards.value.find((c) => c.category === "custom")?.title ?? "",
);
const activityCards = computed(() =>
  cards.value.filter((c) => c.category !== "custom" && c.title),
);

// Per-category source label + themed motion + accent (currentColor for the motif).
// Every colour is a token, the three vendor marks are `--brand-*` in tokens.css.
// They were raw hex here, alongside a `var(--live-ink)`, so the widget owned half
// a palette that no stylesheet could see.
const CAT: Record<string, { src: MessageKey; motif: string; color: string }> = {
  music: { src: "presenceSrcMusic", motif: "music", color: "var(--brand-spotify)" },
  podcast: { src: "presenceSrcPodcast", motif: "music", color: "var(--brand-spotify)" },
  game: { src: "presenceSrcGame", motif: "game", color: "var(--live-ink)" },
  watching: { src: "presenceSrcWatching", motif: "watch", color: "var(--brand-youtube)" },
  streaming: { src: "presenceSrcStreaming", motif: "stream", color: "var(--brand-twitch)" },
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
    src: cats[i] ? t(cats[i]!.src) : "",
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

// Reachable, loaded, and nothing playing, a real "quiet right now" state, shown
// as a gentle line rather than a bare header. Distinct from `unreachable`.
const idle = computed(
  () => loaded.value && !unreachable.value && !activities.value?.length,
);
</script>


<template>
  <!-- Every class is pw-namespaced so the site's global .tile/.stat/.grid/.meta
       rules can't leak into the widget. Rendered whenever presence is enabled in
       the CMS; the server decides what (if anything) is actually shown. -->
  <div v-if="enabled" class="pw">
    <!-- Discord profile, already filtered by the server -->
    <div class="pw-unit">
      <div class="pw-who">
        <div class="pw-avatar">
          <img v-if="discordAvatarSrc" :src="discordAvatarSrc" alt="" class="pw-av" loading="lazy" />
          <AssetPicture v-else-if="avatar" :view="avatar" class="pw-av" />
          <span v-else>{{ initials }}</span>
          <span class="pw-pip" :class="'pw-s-' + status" />
        </div>
        <div class="pw-idcol">
          <div class="pw-name">
            {{ name }}<span class="pw-handle">{{ handle }}</span>
          </div>
          <div class="pw-stat">
            <span v-if="unreachable" class="pw-lbl">{{ t("presenceUnreachable") }}</span>
            <span v-else class="pw-lbl">{{ t(STATUS_LABEL[status] ?? "presenceOffline") }}</span>
            <span v-if="!loaded" class="pw-muted">{{ t("presenceLoading") }}</span>
            <span v-else-if="unreachable" class="pw-muted">{{ t("presenceUnknown") }}</span>
          </div>
          <!--
            Both quotation marks, and both from the same span class.

            The closing one was simply missing, so a Discord status rendered as
            an open quote that never resolved. The text is clamped to two lines,
            which means a long status ends in an ellipsis and the closer is the
            only thing telling a reader the quote was cut rather than broken.
          -->
          <div v-if="customStatus" class="pw-cstat">
            <span class="pw-q">“</span>{{ customStatus }}<span class="pw-q pw-q-close">”</span>
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
              loading="lazy"
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
      <div v-else-if="idle" class="pw-act pw-off">
        {{ t(status === "offline" ? "presenceOfflineIdle" : "presenceNoActivity") }}
      </div>
    </div>
  </div>

  <!-- Enabled but nothing has loaded yet is handled above (the profile shows
       "loading…"); this branch is only the deliberate "owner hid every live
       category" case. No mention of any server config — that's not the visitor's
       concern, and never leaking it is the whole point of the split. -->
  <p v-else class="pw-muted pw-np">{{ t("presenceNothing") }}</p>
</template>

<style scoped>
.pw {
  background: var(--surf-3);
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  padding: var(--space-4);
  color: var(--ink);
}

.pw-unit {
  min-width: 0;
}
.pw-who {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}
.pw-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--r-round);
  flex: none;
  position: relative;
  display: grid;
  place-items: center;
  font-family: var(--f-d);
  font-weight: 700;
  font-size: var(--fs-body);
  color: var(--ink-strong);
  background: var(--surf-2);
  border: 1px solid var(--line-2);
}
.pw-av {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--r-round);
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
  border-radius: var(--r-round);
  display: block;
}
.pw-pip {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 16px;
  height: 16px;
  border-radius: var(--r-round);
  border: 3px solid var(--surf-3);
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
  border-radius: var(--r-round);
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
  border-radius: var(--r-1);
  background: var(--surf-3);
}
.pw-pip.pw-s-offline {
  background: transparent;
  border-color: var(--surf-3);
  box-shadow: inset 0 0 0 2px var(--ink);
}

.pw-idcol {
  min-width: 0;
  flex: 1;
}
.pw-name {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-body);
  color: var(--ink-strong);
  line-height: 1.15;
}
.pw-handle {
  font-family: var(--f-b);
  font-size: var(--fs-meta);
  font-weight: 400;
  color: var(--ink);
  margin-left: var(--space-2);
}
.pw-stat {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--fs-meta);
  color: var(--ink);
  margin-top: var(--space-1);
}
.pw-lbl {
  font-weight: 600;
}
.pw-cstat {
  font-size: var(--fs-meta);
  color: var(--ink);
  line-height: 1.35;
  margin-top: var(--space-1);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pw-q {
  font-family: var(--f-d);
  color: var(--ink);
  margin-right: 1px;
}
.pw-q-close {
  margin-right: 0;
  margin-left: 1px;
}

.pw-act {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--line-2);
}
.pw-actitem {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-width: 0;
}
.pw-art {
  width: 48px;
  height: 48px;
  border-radius: var(--r-2);
  flex: none;
  object-fit: cover;
}
.pw-art-ph {
  background: var(--surf-2);
  border: 1px solid var(--line-2);
}
.pw-abody {
  min-width: 0;
  flex: 1;
}
.pw-src {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--f-b);
  font-size: var(--fs-meta);
  font-weight: 600;
}
.pw-atitle {
  font-size: var(--fs-small);
  font-weight: 600;
  color: var(--ink-strong);
  margin-top: var(--space-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-asub {
  font-size: var(--fs-meta);
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-off {
  color: var(--ink);
  font-size: var(--fs-meta);
}

/* themed motion, inherits currentColor from .pw-src */
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
  border-radius: var(--r-1);
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
  border-radius: var(--r-1);
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
  border-radius: var(--r-1);
}
.pw-watch i {
  position: absolute;
  top: 50%;
  margin-top: -2px;
  width: 4px;
  height: 4px;
  border-radius: var(--r-round);
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

.pw-muted {
  color: var(--muted);
}
.pw .pw-muted {
  color: var(--ink);
}
.pw-np {
  font-size: var(--fs-meta);
}

@media (prefers-reduced-motion: reduce) {
  .pw-anim i,
  .pw-anim b,
  .pw-pip::after,
  .pw-pip {
    animation: none !important;
  }
}
</style>
