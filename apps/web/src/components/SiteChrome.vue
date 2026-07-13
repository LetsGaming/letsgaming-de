<script setup lang="ts">
import type { NavView } from "@lg/core";
import { useStore } from "@nanostores/vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { icons } from "../lib/icons";
import {
	$activeTab,
	$theme,
	initSite,
	setLocale,
	setTab,
	toggleTheme,
} from "../stores/site";
import SettingsModal from "./SettingsModal.vue";

const props = defineProps<{ nav: NavView[]; locale: "en" | "de"; name: string }>();

const activeTab = useStore($activeTab);
const theme = useStore($theme);
const settingsOpen = ref(false);
// Drawer is chrome-only UI state: closed on desktop (the sidebar is a static
// column there), toggled on mobile. Not business logic, so it lives here.
const drawerOpen = ref(false);

// During SSR the shared atom is still "", so fall back to the first area for the
// active-tab highlight; after hydration initSite() has seeded it to the same id.
const current = computed(() => activeTab.value || props.nav[0]?.id);

/** Toggle body scroll-lock so the page behind the mobile drawer can't scroll. */
function lockScroll(on: boolean) {
	if (typeof document === "undefined") return;
	document.body.classList.toggle("nav-locked", on);
}
function openDrawer() {
	drawerOpen.value = true;
	lockScroll(true);
}
function closeDrawer() {
	drawerOpen.value = false;
	lockScroll(false);
}

function onNav(id: string) {
	setTab(id);
	closeDrawer();
	if (typeof window !== "undefined")
		window.scrollTo({ top: 0, behavior: "smooth" });
}

function onKey(e: KeyboardEvent) {
	if (e.key === "Escape" && drawerOpen.value) closeDrawer();
}

onMounted(() => {
	initSite(props.nav);
	window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
	window.removeEventListener("keydown", onKey);
	lockScroll(false);
});
</script>

<template>
  <!-- Mobile-only bar: brand + hamburger. Hidden ≥ the nav breakpoint (CSS). -->
  <header class="topbar-m">
    <div class="brand"><span class="mark">D</span><span>{{ name }}</span></div>
    <button class="burger" aria-label="Open menu" @click="openDrawer" v-html="icons.menu" />
  </header>

  <!-- Backdrop for the mobile drawer -->
  <div class="scrim" :class="{ show: drawerOpen }" @click="closeDrawer" />

  <!-- Side menu: a static column on desktop, an off-canvas drawer on mobile.
       Always in the DOM (only CSS transforms it off-screen) so the nav buttons
       stay queryable and the two islands stay in sync via the store. -->
  <aside class="sidebar" :class="{ open: drawerOpen }">
    <div class="sidehead">
      <div class="brand"><span class="mark">D</span><span>{{ name }}</span></div>
      <button class="burger close-m" aria-label="Close menu" @click="closeDrawer" v-html="icons.close" />
    </div>

    <nav class="side-nav" aria-label="Sections">
      <button
        v-for="area in nav"
        :key="area.id"
        class="side-tab"
        :class="{ active: area.id === current }"
        :aria-current="area.id === current ? 'page' : undefined"
        @click="onNav(area.id)"
      >
        {{ area.label }}
      </button>
    </nav>

    <div class="side-foot">
      <button class="side-settings" @click="settingsOpen = true">
        <span class="ico" v-html="icons.settings" /><span>Settings</span>
      </button>
    </div>

    <SettingsModal
      :open="settingsOpen"
      :theme="theme"
      :locale="locale"
      @close="settingsOpen = false"
      @toggle-theme="toggleTheme"
      @set-locale="setLocale"
    />
  </aside>
</template>
