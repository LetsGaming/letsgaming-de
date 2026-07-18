<script setup lang="ts">
import type { ImageAssetView, GifAssetView } from "@lg/core";
import { apiBase } from "../../lib/api";

// Renders a resolved image/gif asset view as a <picture>. Variant URLs are
// origin-relative (served by the API host), so we prefix them here.
const props = defineProps<{ view: ImageAssetView | GifAssetView }>();

const abs = (u: string) => (u.startsWith("/") ? apiBase + u : u);
const pfx = (s?: string) => (s ? s.split(", ").map(abs).join(", ") : undefined);

const avif = props.view.kind === "image" ? pfx(props.view.srcsetAvif) : undefined;
const webp = props.view.kind === "image" ? pfx(props.view.srcsetWebp) : undefined;
</script>

<template>
  <picture>
    <source v-if="avif" type="image/avif" :srcset="avif" />
    <source v-if="webp" type="image/webp" :srcset="webp" />
    <img :src="abs(view.src)" :alt="view.alt" :width="view.width" :height="view.height" loading="lazy" />
  </picture>
</template>
