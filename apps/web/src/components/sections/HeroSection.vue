<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import { mdBold } from "../../lib/site";
import { trackClick } from "../../lib/track";
import AssetPicture from "../AssetPicture.vue";

const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "hero" }>;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();

/** Intercept internal `#anchor` links so they switch tab + scroll instead of no-oping. */
function onLink(e: MouseEvent, href: string) {
  if (href.startsWith("#")) {
    e.preventDefault();
    props.goAnchor?.(href.slice(1));
    trackClick("contact-cta");
  } else {
    trackClick("social");
  }
}
</script>

<template>
  <AssetPicture v-if="module.data.avatar" :view="module.data.avatar" class="avatar rise" />
  <span class="eyebrow rise">{{ module.data.eyebrow }}</span>
  <h1 class="rise">
    {{ module.data.headline.before
    }}<span class="pop">{{ module.data.headline.highlight }}</span
    >{{ module.data.headline.after }}
  </h1>
  <p class="lede rise" v-html="mdBold(module.data.lede)" />
  <div class="status rise">
    <span class="dot" /> {{ module.data.status.verb }} <b>{{ module.data.status.now }}</b>
  </div>
  <div class="links rise">
    <a
      v-for="l in module.data.links"
      :key="l.id"
      class="btn"
      :class="l.primary ? 'btn-primary' : 'btn-ghost'"
      :href="l.href"
      @click="onLink($event, l.href)"
    >
      <span v-if="l.iconSvg" class="lico" v-html="l.iconSvg" /><span
        v-else-if="l.icon"
        v-html="icons[l.icon]"
      />{{ l.label }}
    </a>
  </div>
</template>
