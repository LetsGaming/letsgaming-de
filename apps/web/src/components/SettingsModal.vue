<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { analyticsAllowed, dntActive, setOptedOut } from "../lib/track";

const props = defineProps<{ open: boolean; theme: "dark" | "light"; locale: "en" | "de" }>();
const emit = defineEmits<{ close: []; "toggle-theme": []; "set-locale": ["en" | "de"] }>();

// Teleport must not render during SSR inside an Astro island (it corrupts
// hydration). Only mount it after the client takes over.
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

const dnt = ref(false);
const analyticsOn = ref(true);

function refresh() {
  dnt.value = dntActive();
  analyticsOn.value = analyticsAllowed(); // false if DNT or previously opted out
}

function toggleAnalytics() {
  if (dnt.value) return; // forced off by the browser — not user-changeable here
  const nowOn = !analyticsOn.value;
  setOptedOut(!nowOn);
  analyticsOn.value = nowOn;
}

function setTheme(next: "dark" | "light") {
  if (next !== props.theme) emit("toggle-theme");
}

function setLocale(next: "en" | "de") {
  if (next !== props.locale) emit("set-locale", next);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

watch(
  () => props.open,
  (open) => {
    if (typeof document === "undefined") return;
    if (open) {
      refresh();
      document.addEventListener("keydown", onKey);
    } else {
      document.removeEventListener("keydown", onKey);
    }
  },
);
</script>

<template>
  <Teleport v-if="mounted" to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="panel" role="dialog" aria-modal="true" aria-label="Settings">
          <header>
            <h2>Settings</h2>
            <button class="x" aria-label="Close" @click="emit('close')">✕</button>
          </header>

          <section>
            <h3>Appearance</h3>
            <div class="seg">
              <button :class="{ on: theme === 'light' }" @click="setTheme('light')">Light</button>
              <button :class="{ on: theme === 'dark' }" @click="setTheme('dark')">Dark</button>
            </div>
          </section>

          <section>
            <h3>Privacy</h3>
            <div class="row">
              <div class="rowtext">
                <div class="rowtitle">Anonymous usage analytics</div>
                <p class="rowdesc">
                  Helps me see which sections are useful. No cookies, no IP, no identifier —
                  just aggregate counts. <a href="/datenschutz">Details</a>.
                </p>
              </div>
              <button
                class="switch"
                :class="{ on: analyticsOn, disabled: dnt }"
                :disabled="dnt"
                role="switch"
                :aria-checked="analyticsOn"
                aria-label="Anonymous usage analytics"
                @click="toggleAnalytics"
              >
                <span class="knob" />
              </button>
            </div>
            <p v-if="dnt" class="note">
              Turned off automatically — your browser sends a “Do Not Track” signal, which I respect.
            </p>
          </section>

          <section>
            <h3>Language</h3>
            <div class="seg">
              <button :class="{ on: locale === 'en' }" @click="setLocale('en')">English</button>
              <button :class="{ on: locale === 'de' }" @click="setLocale('de')">Deutsch</button>
            </div>
            <p class="note">
              Reloads the page in your language. Untranslated bits fall back to English.
            </p>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 100;
}
.panel {
  width: 100%;
  max-width: 440px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 20px 22px 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  color: var(--ink);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
header h2 {
  font-family: var(--f-d);
  font-size: 22px;
  color: var(--ink-strong);
}
.x {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 16px;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
}
.x:hover {
  color: var(--ink);
}
section {
  padding: 14px 0;
  border-top: 1px solid var(--line);
}
section h3 {
  font-family: var(--f-m);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}
.seg {
  display: inline-flex;
  gap: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 3px;
}
.seg button {
  font-family: var(--f-m);
  font-size: 13px;
  color: var(--muted);
  background: none;
  border: none;
  border-radius: 9px;
  padding: 7px 16px;
  cursor: pointer;
}
.seg button.on {
  background: var(--purple-wash);
  color: var(--purple-br);
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  justify-content: space-between;
}
.rowtitle {
  font-size: 15px;
  color: var(--ink-strong);
}
.rowdesc {
  font-size: 13px;
  color: var(--muted);
  margin-top: 3px;
  line-height: 1.45;
}
.rowdesc a {
  color: var(--purple-br);
}
.switch {
  flex: none;
  width: 46px;
  height: 27px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--bg);
  cursor: pointer;
  padding: 0;
  position: relative;
  transition: background 0.15s ease;
  margin-top: 2px;
}
.switch .knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  background: var(--muted);
  transition:
    transform 0.15s ease,
    background 0.15s ease;
}
.switch.on {
  background: var(--purple);
  border-color: var(--purple);
}
.switch.on .knob {
  transform: translateX(19px);
  background: #fff;
}
.switch.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.note {
  font-size: 12px;
  color: var(--muted);
  margin-top: 10px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active,
  .switch,
  .switch .knob {
    transition: none;
  }
}
</style>
