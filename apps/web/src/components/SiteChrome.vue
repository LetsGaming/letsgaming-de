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

const props = defineProps<{ nav: NavView[]; locale: "en" | "de" }>();

const activeTab = useStore($activeTab);
const theme = useStore($theme);
const settingsOpen = ref(false);
// Drawer state only matters on small screens (CSS turns the tab cluster into an
// off-canvas drawer there); on desktop the bar is unchanged and this stays false.
const drawerOpen = ref(false);

// During SSR the shared atom is still "", so fall back to the first area for the
// active-tab highlight; after hydration initSite() has seeded it to the same id.
const current = computed(() => activeTab.value || props.nav[0]?.id);

/** Lock body scroll behind the open mobile drawer. */
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
  <!-- Hamburger: only shown ≤680px (CSS); opens the nav drawer. -->
  <button class="nav-burger" aria-label="Open menu" @click="openDrawer" v-html="icons.menu" />

  <!-- Drawer scrim: small screens only. -->
  <div class="scrim" :class="{ show: drawerOpen }" @click="closeDrawer" />

  <!-- Desktop: the original inline tab bar + settings gear, unchanged. Small
       screens: this same cluster becomes an off-canvas drawer (CSS only). -->
  <div class="chrome" :class="{ open: drawerOpen }">
    <button class="nav-close" aria-label="Close menu" @click="closeDrawer" v-html="icons.close" />
    <nav class="tabs" aria-label="Sections">
      <button
        v-for="area in nav"
        :key="area.id"
        class="tab"
        :class="{ active: area.id === current }"
        :aria-current="area.id === current ? 'page' : undefined"
        @click="onNav(area.id)"
      >
        {{ area.label }}
      </button>
    </nav>
    <button
      class="theme-toggle"
      aria-label="Settings"
      @click="settingsOpen = true"
      v-html="icons.settings"
    />
    <SettingsModal
      :open="settingsOpen"
      :theme="theme"
      :locale="locale"
      @close="settingsOpen = false"
      @toggle-theme="toggleTheme"
      @set-locale="setLocale"
    />
  </div>
</template>
