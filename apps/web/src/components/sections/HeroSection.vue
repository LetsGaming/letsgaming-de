<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import { mdBold } from "../../lib/site";
import { trackClick } from "../../lib/track";
import AssetPicture from "../AssetPicture.vue";

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

    A plain <section> with no class: `.sec` carries `margin-top: 52px`, and the
    hero is the top of the page. `.sec:first-child` still resolves the same way,
    because the hero isn't a `.sec` and never was.
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
      <a
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
      </a>
    </div>
  </section>
</template>
