<script setup lang="ts">
import type { NavView } from "@lg/core";
import { useStore } from "@nanostores/vue";
import { computed, onMounted, ref } from "vue";
import { icons } from "../lib/icons";
import { $theme, initSite, setLocale, toggleTheme } from "../stores/site";
import { areaHref } from "../lib/area";
import SettingsModal from "./SettingsModal.vue";

const props = defineProps<{ nav: NavView[]; locale: "en" | "de"; current: string }>();

const theme = useStore($theme);
const settingsOpen = ref(false);
// The server already knows which area this is — it's the URL. No atom, no SSR
// fallback, no hydration gap where the highlight is wrong.
const current = computed(() => props.current);
const href = (id: string) => areaHref(props.nav, id);

onMounted(() => initSite(props.nav));
</script>

<template>

  <!-- Four labels fit at 380px; they always did. What didn't fit was the pill,
       the display face and the nested padding — all of which the rules removed. -->
  <div class="chrome">
    <nav class="tabs" aria-label="Sections">
      <a
        v-for="area in nav"
        :key="area.id"
        class="tab"
        :class="{ active: area.id === current }"
        :aria-current="area.id === current ? 'page' : undefined"
        :href="href(area.id)"
       
      >
        {{ area.label }}
      </a>
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
