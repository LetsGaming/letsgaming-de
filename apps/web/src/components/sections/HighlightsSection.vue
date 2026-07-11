<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import { trackClick } from "../../lib/track";

defineProps<{
  module: Extract<ResolvedModule, { kind: "highlights" }>;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();
</script>

<template>
  <section class="sec">
    <div class="sec-head rise">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div class="box rise">
      <div v-if="module.data.items.length" class="feed">
        <a
          v-for="(h, i) in module.data.items"
          :key="i"
          class="ev ev-link"
          :href="h.href"
          target="_blank"
          rel="noreferrer noopener"
          @click="trackClick('highlight')"
        >
          <span class="ei" v-html="icons[h.type]" />
          <div>
            <div class="et">{{ h.text }}</div>
            <div v-if="h.meta" class="em">{{ h.meta }}</div>
          </div>
          <span class="tm">{{ h.relative }}</span>
        </a>
      </div>
      <div v-else class="sub">Nothing shipped in this window yet — check back soon.</div>
    </div>
  </section>
</template>
