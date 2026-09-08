<script setup lang="ts">
// Nuxt's app-wide error boundary — renders for a 404 (unmatched route) and for
// any uncaught server/render error alike, so the copy has to make sense for both.
// Deliberately its own `useHead` call, not `useSeo`: an error document is never a
// canonical, indexable page, so it gets a `noindex` instead of the tags that would
// make search engines treat it as real content.
import SmartLink from "~/components/ui/SmartLink.vue";

const props = defineProps<{ error: { statusCode: number; statusMessage?: string } }>();

const isNotFound = computed(() => props.error.statusCode === 404);
const heading = computed(() => (isNotFound.value ? "Seite nicht gefunden" : "Etwas ist schiefgelaufen"));
const message = computed(() =>
  isNotFound.value
    ? "Die Adresse existiert nicht (mehr) — vielleicht wurde sie verschoben oder falsch eingegeben."
    : "Ein unerwarteter Fehler ist aufgetreten. Der Versuch, hier weiterzumachen, hilft meistens nicht.",
);

useHead({
  title: `${props.error.statusCode} — letsgaming.de`,
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
    <SmartLink href="/" as="button" class="home" @click="goHome">Zur Startseite</SmartLink>
  </main>
</template>

<style scoped>
.wrap {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  background: var(--surf-0);
  color: var(--ink);
}
/* Type sizes pinned to DESIGN.md's documented ramp (Display / Headline) — no
   invented step, and no glow: the system reserves glow for the live dot alone. */
.code {
  font-family: var(--f-m);
  font-size: clamp(38px, 7.5vw, 66px);
  line-height: 1.03;
  margin: 0;
  color: var(--live);
}
h1 {
  font-family: var(--f-d);
  font-size: clamp(22px, 4vw, 30px);
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
  margin-top: 12px;
  padding: 12px 20px;
  border-radius: 15px;
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
