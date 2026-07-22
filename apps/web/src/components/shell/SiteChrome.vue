<script setup lang="ts">
import type { NavView } from "@lg/core";
import { computed, onMounted, ref } from "vue";
import { icons } from "../../lib/icons";
import { useSiteState, useTheme } from "../../composables/useSiteState";
import { areaHref } from "../../lib/area";
import SmartLink from "../ui/SmartLink.vue";
import SettingsModal from "./SettingsModal.vue";

const props = defineProps<{ nav: NavView[]; locale: "en" | "de"; current: string }>();

// `theme` comes from its own call rather than the destructured bundle: a direct
// ref binding is what the template unwraps cleanly.
const theme = useTheme();
const { initSite, setLocale, toggleTheme } = useSiteState();
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
      <SmartLink
        v-for="area in nav"
        :key="area.id"
        class="tab"
        :class="{ active: area.id === current }"
        :aria-current="area.id === current ? 'page' : undefined"
        :href="href(area.id)"
      >
        {{ area.label }}
      </SmartLink>
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
