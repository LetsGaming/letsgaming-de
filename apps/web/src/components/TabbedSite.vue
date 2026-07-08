<script setup lang="ts">
import type { NavView, SiteView } from "@lg/core";
import { nextTick, onMounted, ref } from "vue";
import { icons } from "../lib/icons";
import { initTracking, trackClick, trackSwitch } from "../lib/track";
import Module from "./Module.vue";
import SettingsModal from "./SettingsModal.vue";

const props = defineProps<{ site: SiteView }>();

const active = ref(props.site.nav[0]?.id ?? "home");
const theme = ref<"dark" | "light">("dark");
const settingsOpen = ref(false);
const root = ref<HTMLElement | null>(null);

const prefersReduced = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Modules a leaf area places, in order (skips missing ids defensively). */
function areaModules(area: NavView) {
  return (area.modules ?? []).map((id) => props.site.modules[id]).filter(Boolean);
}

function go(id: string) {
  if (id === active.value) return;
  active.value = id;
  trackSwitch(id);
  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  void nextTick(() => animate(id));
}

/** Jump to a section by module id (e.g. "contact"): switch to the tab that holds
 *  it, then scroll it into view. Powers internal `#anchor` links like "Get in touch". */
function goToAnchor(target: string) {
  const area =
    props.site.nav.find((a) => (a.modules ?? []).includes(target)) ??
    props.site.nav.find((a) => a.id === target);
  if (!area) return;
  if (area.id !== active.value) {
    active.value = area.id;
    trackSwitch(area.id);
    void nextTick(() => animate(area.id));
  }
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/** Re-trigger the staggered entrance and (re)attach tilt within a panel. */
function animate(id: string) {
  const panel = root.value?.querySelector<HTMLElement>(`[data-panel="${id}"]`);
  if (!panel) return;
  const reduced = prefersReduced();
  panel.querySelectorAll<HTMLElement>(".rise").forEach((el, i) => {
    el.classList.remove("in");
    void el.offsetWidth; // restart the animation
    if (reduced) el.classList.add("in");
    else window.setTimeout(() => el.classList.add("in"), 70 * i);
  });
  if (!reduced) panel.querySelectorAll<HTMLElement>(".card, .tile").forEach(tilt);
}

function tilt(el: HTMLElement) {
  if (el.dataset.tilt) return;
  el.dataset.tilt = "1";
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(720px) rotateY(${px * 6}deg) rotateX(${-py * 6}deg) translateY(-4px)`;
  });
  el.addEventListener("pointerleave", () => (el.style.transform = ""));
}

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme.value;
  trackClick("theme-toggle");
  try {
    localStorage.setItem("theme", theme.value);
  } catch {
    /* private mode — ignore */
  }
}

onMounted(() => {
  const current = document.documentElement.dataset.theme;
  theme.value = current === "light" ? "light" : "dark";
  animate(active.value);
  initTracking(active.value, theme.value);
});
</script>

<template>
  <div ref="root" class="wrap">
    <div class="top">
      <div class="brand"><span class="mark">D</span><span>{{ site.meta.name }}</span></div>
      <div class="chrome">
        <nav class="tabs" aria-label="Sections">
          <button
            v-for="area in site.nav"
            :key="area.id"
            class="tab"
            :class="{ active: area.id === active }"
            :aria-current="area.id === active ? 'page' : undefined"
            @click="go(area.id)"
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
      </div>
    </div>

    <SettingsModal
      :open="settingsOpen"
      :theme="theme"
      @close="settingsOpen = false"
      @toggle-theme="toggleTheme"
    />

    <section
      v-for="area in site.nav"
      :key="area.id"
      class="panel"
      :data-panel="area.id"
      :hidden="area.id !== active"
    >
      <Module v-for="m in areaModules(area)" :key="m!.id" :module="m!" :go="go" :go-anchor="goToAnchor" />
    </section>

    <footer>
      made with a lot of <b>purple</b> · @{{ site.meta.handle }} ·
      <a href="/datenschutz" style="color: var(--purple-br)">Datenschutz</a>
    </footer>
  </div>
</template>
