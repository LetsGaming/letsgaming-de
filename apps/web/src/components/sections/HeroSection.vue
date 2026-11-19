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
    <p v-if="module.data.presenceEnabled && liveText" class="status" aria-live="polite">
      <span class="dot" :class="{ on: liveParts.length > 0 }" />
      <span class="status-text">{{ liveText }}</span>
    </p>
    <p class="lede" v-html="mdBold(module.data.lede)" />
    <div class="links">
      <SmartLink
        v-for="l in module.data.links"
        :key="l.id"
        :class="l.primary ? 'btn btn-primary' : 'quiet'"
        :href="l.href"
        @click="onLink(l)"
      >
        <template v-if="l.primary"
          ><span v-if="l.iconSvg" class="lico" v-html="l.iconSvg" /><span
            v-else-if="l.icon"
            v-html="icons[l.icon]"
          />{{ l.label }}</template
        >
        <template v-else>{{ l.label }}</template>
      </SmartLink>
      <button type="button" class="wave" :disabled="waved" :aria-label="t('waveLabel')" @click="wave">
        {{ waved ? t("waveDone") : t("waveButton") }}
        <span v-if="waves > 0" class="wave-count">{{ waves }}</span>
      </button>
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
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
  font-size: var(--fs-h3);
  line-height: 1.3;
  color: var(--ink-strong);
}
.status .dot {
  margin-top: 0.5em;
  width: 11px;
  height: 11px;
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
  min-height: 32px;
  padding: var(--space-1) var(--space-3);
  font: inherit;
  font-size: var(--fs-small);
  color: var(--ink);
  background: var(--surf-1);
  border: 1px solid var(--line-control);
  border-radius: var(--r-2);
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
  color: var(--ink-strong);
  background: var(--surf-2);
}
.wave:disabled {
  cursor: default;
  color: var(--muted);
  background: none;
}
.wave-count {
  font-family: var(--f-m);
  color: var(--ink);
}
.links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-5);
  margin-top: var(--space-5);
}
.quiet {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: var(--space-1) 0;
  color: var(--ink);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.25em;
}
.quiet:hover {
  color: var(--ink-strong);
  text-decoration-thickness: 2px;
}
@media (pointer: coarse) {
  .quiet {
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .status .dot.on {
    animation: none;
  }
}
</style>
