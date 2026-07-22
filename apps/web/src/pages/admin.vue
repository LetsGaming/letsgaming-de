<script setup lang="ts">
/**
 * The CMS shell. Auth and data all happen client-side against the API, so the
 * server never renders private content — there is none at render time: `CmsApp`
 * shows "Loading…" until a token fetch returns, and that's what SSR emits.
 *
 * Rendered normally (the equivalent of Astro's `client:load`, not `client:only`).
 * Under Astro, `client:only` meant the component was never walked at build, so the
 * stylesheets for everything inside it — the editor canvas renders the site's real
 * sections — were never emitted, and the guestbook and presence widget rendered
 * naked in the editor. Nuxt collects those styles from the component tree either
 * way, but rendering normally keeps the behaviour explicit rather than incidental.
 */
import CmsApp from "~/components/cms/CmsApp.vue";

useHead({ title: "CMS — letsgaming.de" });
definePageMeta({ layout: "default" });
</script>

<template>
  <CmsApp />
</template>
