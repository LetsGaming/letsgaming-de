<script setup lang="ts">
import type { ImageAssetView, GifAssetView } from "@lg/core";
import { apiBase } from "../../lib/api";

// Renders a resolved image/gif asset view as a <picture>. Variant URLs are
// origin-relative (served by the API host), so we prefix them here.
const props = withDefaults(
  defineProps<{
    view: ImageAssetView | GifAssetView;
    /** Set to "eager" for an above-the-fold image (e.g. the hero avatar) so it
     *  doesn't compete with LCP the way a deferred fetch would. Defaults to
     *  "lazy", right for the gallery/card usages this component mostly serves. */
    loading?: "lazy" | "eager";
  }>(),
  { loading: "lazy" },
);

const abs = (u: string) => (u.startsWith("/") ? apiBase + u : u);
const pfx = (s?: string) => (s ? s.split(", ").map(abs).join(", ") : undefined);

const avif = props.view.kind === "image" ? pfx(props.view.srcsetAvif) : undefined;
const webp = props.view.kind === "image" ? pfx(props.view.srcsetWebp) : undefined;
</script>

<template>
  <picture>
    <source v-if="avif" type="image/avif" :srcset="avif" />
    <source v-if="webp" type="image/webp" :srcset="webp" />
    <img
      :src="abs(view.src)"
      :alt="view.alt"
      :width="view.width"
      :height="view.height"
      :loading="loading"
      :fetchpriority="loading === 'eager' ? 'high' : undefined"
    />
  </picture>
</template>
