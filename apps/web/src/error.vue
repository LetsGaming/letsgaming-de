<script setup lang="ts">
// Nuxt's app-wide error boundary, renders for a 404 (unmatched route) and for
// any uncaught server/render error alike, so the copy has to make sense for both.
// Deliberately its own `useHead` call, not `useSeo`: an error document is never a
// canonical, indexable page, so it gets a `noindex` instead of the tags that would
// make search engines treat it as real content.
import SmartLink from "~/components/ui/SmartLink.vue";
import { useT } from "~/composables/useT";

const props = defineProps<{ error: { statusCode: number; statusMessage?: string } }>();

const { t } = useT();
const isNotFound = computed(() => props.error.statusCode === 404);
const heading = computed(() => t(isNotFound.value ? "errorNotFoundTitle" : "errorGenericTitle"));
const message = computed(() => t(isNotFound.value ? "errorNotFoundText" : "errorGenericText"));

useHead({
  title: `${props.error.statusCode} | letsgaming.de`,
  meta: [{ name: "robots", content: "noindex" }],
});

// clearError({ redirect }) both dismisses the error boundary and navigates, so a
// stale error state can't survive the trip back to the homepage.
function goHome() {
  clearError({ redirect: "/" });
}
</script>

<template>
  <main class="wrap">
    <p class="code">{{ error.statusCode }}</p>
    <h1>{{ heading }}</h1>
    <p class="msg">{{ message }}</p>
    <SmartLink href="/" as="button" class="home" @click="goHome">{{ t("errorHome") }}</SmartLink>
  </main>
</template>

<style scoped>
.wrap {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-12);
  padding: var(--sp-24);
  text-align: center;
  background: var(--surf-0);
  color: var(--ink);
}
/* Type sizes pinned to DESIGN.md's documented ramp (Display / Headline), no
   invented step, and no glow: the system reserves glow for the live dot alone. */
.code {
  font-family: var(--f-m);
  font-size: var(--fs-display);
  line-height: 1;
  margin: 0;
  color: var(--muted);
}
h1 {
  font-family: var(--f-d);
  font-size: var(--fs-h2);
  font-weight: 600;
  margin: 0;
  color: var(--ink-strong);
}
.msg {
  max-width: 46ch;
  margin: 0;
  color: var(--muted);
}
/* Primary button per DESIGN.md: Shelf Violet solid fill, white text, 15px
   radius, 12px/20px padding, translateY(2px) on press. */
.home {
  margin-top: var(--sp-12);
  padding: var(--sp-12) var(--sp-20);
  border-radius: var(--r-2);
  border: none;
  background: var(--live-solid);
  color: #fff;
  font-family: var(--f-b);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  transition: transform 120ms ease;
}
.home:active {
  transform: translateY(2px);
}
</style>
