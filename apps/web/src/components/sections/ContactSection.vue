<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import { trackClick } from "../../lib/track";
import ContactForm from "../ContactForm.vue";

defineProps<{
  module: Extract<ResolvedModule, { kind: "contact" }>;
  go: (id: string) => void;
}>();
</script>

<template>
  <section :id="module.id" class="sec">
    <div class="sec-head"><h2>{{ module.data.heading }}</h2></div>
    <div
      v-if="module.data.links.filter((l) => !l.href.startsWith('#')).length"
      class="links"
    >
      <a
        v-for="l in module.data.links.filter((l) => !l.href.startsWith('#'))"
        :key="l.id"
        class="btn"
        :class="l.primary ? 'btn-primary' : 'btn-ghost'"
        :href="l.href"
        target="_blank"
        rel="noreferrer noopener"
        @click="trackClick('social')"
      >
        <span v-if="l.iconSvg" class="lico" v-html="l.iconSvg" /><span v-else-if="l.icon" v-html="icons[l.icon]" />{{ l.label }}
      </a>
    </div>
    <div style="margin-top: 20px"><ContactForm /></div>
  </section>
</template>
