<script setup lang="ts">
import type { NavView } from "@lg/core";
import { useStore } from "@nanostores/vue";
import { computed, onMounted, ref } from "vue";
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

// During SSR the shared atom is still "", so fall back to the first area for the
// active-tab highlight; after hydration initSite() has seeded it to the same id.
const current = computed(() => activeTab.value || props.nav[0]?.id);

function onNav(id: string) {
	setTab(id);
	if (typeof window !== "undefined")
		window.scrollTo({ top: 0, behavior: "smooth" });
}

onMounted(() => initSite(props.nav));
</script>

<template>
  <div class="chrome">
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
