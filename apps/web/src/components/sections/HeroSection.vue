<script setup lang="ts">
import type { ClickAction, ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import SmartLink from "../ui/SmartLink.vue";
import { mdBold } from "../../lib/text";
import { trackClick } from "../../lib/track";
import AssetPicture from "../ui/AssetPicture.vue";
import { computed } from "vue";
import { usePresence } from "~/composables/usePresence";
import { useWave } from "~/composables/useWave";
import { useT } from "~/composables/useT";

const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "hero" }>;
}>();

const { t } = useT();

// Live status comes from the server-filtered presence relay, so Show switches and
// hidden activities are already applied. Only games and songs are surfaced here;
// whatever the relay returns for other categories (episodes included) is ignored.
const { view: presence } = usePresence(() => props.module.data.presenceEnabled);
const liveParts = computed(() =>
  (presence.value?.cards ?? []).flatMap((c) =>
    c.category === "game" && c.title
      ? [t("heroPlaying", { name: c.title })]
      : c.category === "music" && c.title
        ? [t("heroListening", { name: c.title })]
        : [],
  ),
);
const liveText = computed(() => {
  if (liveParts.value.length) return t("heroRightNow", { parts: liveParts.value.join(", ") });
  const last = props.module.data.lastActivity;
  if (!last) return "";
  return t(last.kind === "game" ? "heroLastPlayed" : "heroLastListened", {
    name: last.name,
    age: last.relative,
  });
});

const { count: waves, waved, wave } = useWave(props.module.data.waves);

// Report the click, do not intercept it: the browser already follows `/about#contact`.
const heroAction = (l: { href: string; primary?: boolean }): ClickAction => {
  if (!l.href.startsWith("/") && !l.href.startsWith("#")) return /^https?:\/\/(www\.)?github\.com\//.test(l.href) ? "hero-github" : "social";
  if (l.primary) return "hero-cta";
  return /contact/i.test(l.href) ? "hero-contact" : "hero-cta";
};
const onLink = (l: { href: string; primary?: boolean }) => trackClick(heroAction(l));
</script>

<template>
  <!-- A plain root without the ModuleSection shell: the hero is the top of the page and takes no section margin. -->
  <section :id="module.id" class="hero">
    <div class="title">
      <AssetPicture v-if="module.data.avatar" :view="module.data.avatar" class="avatar" loading="eager" />
      <h1>{{ module.data.headline.before }}{{ module.data.headline.highlight }}{{ module.data.headline.after }}</h1>
    </div>
    <p class="lede" v-html="mdBold(module.data.lede)" />
    <div class="status" aria-live="polite">
      <template v-if="module.data.presenceEnabled && liveText">
        <span class="dot" :class="{ on: liveParts.length > 0 }" />
        <span class="status-text">{{ liveText }}</span>
      </template>
      <button type="button" class="wave" :disabled="waved" :aria-label="t('waveLabel')" @click="wave">
        {{ waved ? t("waveDone") : t("waveButton") }}
        <span v-if="waves > 0" class="wave-count">{{ waves }}</span>
      </button>
    </div>
    <div class="links">
      <SmartLink
        v-for="l in module.data.links"
        :key="l.id"
        class="btn"
        :class="l.primary ? 'btn-primary' : 'btn-ghost'"
        :href="l.href"
        @click="onLink(l)"
      >
        <span v-if="l.iconSvg" class="lico" v-html="l.iconSvg" /><span
          v-else-if="l.icon"
          v-html="icons[l.icon]"
        />{{ l.label }}
      </SmartLink>
    </div>
  </section>
</template>

<style scoped>
.hero {
  padding-top: var(--space-6);
}
.title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-5);
  margin: 0 0 var(--space-5);
}
.title h1 {
  margin: 0;
  min-width: 0;
  max-width: 16ch;
  flex: 1 1 14ch;
}
.avatar {
  flex: none;
}
.avatar :deep(img) {
  display: block;
  width: 72px;
  height: 72px;
  border-radius: var(--r-round);
  object-fit: cover;
}
.lede {
  max-width: 40ch;
  margin: 0;
  font-size: var(--fs-h2);
  line-height: 1.4;
  color: var(--ink);
}
.lede :deep(b) {
  font-weight: inherit;
  color: inherit;
}
.status {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  margin-top: var(--space-4);
  font-size: var(--fs-body);
  color: var(--ink);
}
.status .dot {
  flex: none;
  align-self: center;
  width: 9px;
  height: 9px;
  border-radius: var(--r-round);
  background: var(--muted);
}
.status .dot.on {
  background: var(--live-ink);
  box-shadow: var(--glow-live);
  animation: pulse var(--dur-pulse) ease-in-out infinite;
}
.status-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.wave {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  min-height: 24px;
  padding: var(--space-1) 0;
  font: inherit;
  font-size: var(--fs-small);
  color: var(--muted);
  background: none;
  border: 0;
  text-decoration: underline;
  text-underline-offset: 0.2em;
  cursor: pointer;
}
@media (pointer: coarse) {
  .wave {
    min-height: 44px;
    min-width: 44px;
    justify-content: center;
  }
}
.wave:hover:not(:disabled) {
  color: var(--ink);
}
.wave:disabled {
  cursor: default;
  text-decoration: none;
  color: var(--muted);
}
.wave-count {
  font-family: var(--f-m);
  color: var(--ink);
}
.links {
  margin-top: var(--space-4);
}
@media (prefers-reduced-motion: reduce) {
  .status .dot.on {
    animation: none;
  }
}
</style>
