<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import SmartLink from "../ui/SmartLink.vue";
import { mdBold } from "../../lib/text";
import { trackClick } from "../../lib/track";
import AssetPicture from "../ui/AssetPicture.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "hero" }>;
}>();

/**
 * Report the click. Don't intercept it.
 *
 * This used to `preventDefault()` on any `#` href and hand the target to
 * `goAnchor` — "so they switch tab + scroll instead of no-oping", from when areas
 * were tabs and `#contact` pointed at something not in the DOM. Areas have been
 * routes for a while; the resolver now answers `#contact` with `/about#contact`,
 * and a browser has known what to do with that since 1993.
 *
 * The interception wasn't merely redundant, it was load-bearing in the wrong
 * direction: `safeHref` had been flattening `#contact` to `"#"` because the href
 * pattern didn't allow fragments, and this handler swallowed the click before
 * anyone could notice the CTA was dead.
 */
const onLink = (href: string) => trackClick(href.startsWith("/") || href.startsWith("#") ? "contact-cta" : "social");
</script>

<template>
  <!--
    A root, so this module is one element like the other thirteen.

    It was a fragment — avatar, h1, lede, status as siblings of `.panel` — which
    is fine for the site and quietly false for anything counting modules: the
    editor canvas mapped `.panel`'s Nth child to the Nth module and the hero alone
    is five of them, so every handle after it belonged to the wrong section.

    A plain <section> with no shell: ModuleSection carries the `margin-top` every
    other module gets, and the hero is the top of the page, so it wants none. It
    renders its own root directly and opts out of ModuleSection by design.
  -->
  <section :id="module.id">
    <AssetPicture v-if="module.data.avatar" :view="module.data.avatar" class="avatar" />
    <h1>
      {{ module.data.headline.before
      }}<span class="pop">{{ module.data.headline.highlight }}</span
      >{{ module.data.headline.after }}
    </h1>
    <p class="lede" v-html="mdBold(module.data.lede)" />
    <div class="status">
      <span class="dot" /> {{ module.data.status.verb }} <b>{{ module.data.status.now }}</b>
    </div>
    <div class="links">
      <SmartLink
        v-for="l in module.data.links"
        :key="l.id"
        class="btn"
        :class="l.primary ? 'btn-primary' : 'btn-ghost'"
        :href="l.href"
        @click="onLink(l.href)"
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
/* Hero-unique styling. Shared bits (.links, .btn, .btn-primary/ghost, .lico) stay
 * global. Two :deep() cases: `.lede b` is v-html, and `.avatar img` is inside the
 * AssetPicture child. `h1 .pop` targets the highlight span in this template. */
h1 .pop {
  color: var(--ink-strong);
  position: relative;
  white-space: nowrap;
}
h1 .pop::after {
  content: "";
  position: absolute;
  left: -2%;
  right: -2%;
  bottom: 0.08em;
  height: 0.2em;
  background: var(--line-2);
  opacity: 0.35;
  border-radius: 6px;
  z-index: -1;
  transform: rotate(-1deg);
}
.lede {
  font-size: clamp(16px, 2.3vw, 20px);
  color: var(--muted);
  max-width: 560px;
}
.lede :deep(b) {
  color: var(--ink);
  font-weight: 600;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-10);
  font-family: var(--f-m);
  font-size: 13px;
  color: var(--muted);
  margin-top: var(--sp-22);
}
.status .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--live-ink);
  box-shadow: var(--glow-live);
  animation: pulse 2.2s infinite;
}
.status b {
  color: var(--ink);
  font-weight: 400;
}
@keyframes pulse {
  50% {
    opacity: 0.32;
  }
}
.avatar :deep(img) {
  width: 104px;
  height: 104px;
  border-radius: 24px;
  object-fit: cover;
  margin-bottom: var(--sp-18);
  border: 1px solid var(--line-1);
}
</style>
