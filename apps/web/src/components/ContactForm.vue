<script setup lang="ts">
import { ref } from "vue";
import { trackClick } from "../lib/track";

const API_BASE = (import.meta.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");

const name = ref("");
const email = ref("");
const message = ref("");
const website = ref(""); // honeypot — real users leave this empty
const state = ref<"idle" | "sending" | "sent" | "error">("idle");
const error = ref("");

async function submit() {
  if (state.value === "sending") return;
  state.value = "sending";
  error.value = "";
  try {
    const res = await fetch(`${API_BASE}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.value,
        email: email.value,
        message: message.value,
        website: website.value,
      }),
    });
    if (res.ok) {
      state.value = "sent";
      trackClick("contact-submit");
      name.value = email.value = message.value = "";
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    error.value =
      res.status === 503
        ? "The contact form isn't configured yet — email works below."
        : res.status === 429
          ? "Too many messages just now — please try again a little later."
          : (body.error ?? `Something went wrong (${res.status}).`);
    state.value = "error";
  } catch {
    error.value = "Couldn't reach the server. Please try again.";
    state.value = "error";
  }
}
</script>

<template>
  <form class="cform" @submit.prevent="submit">
    <div v-if="state === 'sent'" class="ok">Thanks — your message is on its way. I'll get back to you soon.</div>
    <template v-else>
      <div class="grid">
        <label>Name<input v-model="name" required maxlength="120" autocomplete="name" /></label>
        <label>Email<input v-model="email" type="email" required maxlength="200" autocomplete="email" /></label>
      </div>
      <label>Message<textarea v-model="message" required maxlength="5000" rows="4" /></label>
      <input v-model="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <div class="foot">
        <span v-if="state === 'error'" class="err">{{ error }}</span>
        <button class="btn btn-primary" type="submit" :disabled="state === 'sending'">
          {{ state === "sending" ? "Sending…" : "Send message" }}
        </button>
      </div>
    </template>
  </form>
</template>

<style scoped>
.cform { display: flex; flex-direction: column; gap: 12px; max-width: 560px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
label { display: flex; flex-direction: column; gap: 5px; font-family: var(--f-m); font-size: 12px; color: var(--muted); }
input, textarea { font-family: var(--f-b); font-size: 15px; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 11px; padding: 11px 13px; width: 100%; }
input:focus, textarea:focus { outline: none; border-color: var(--purple-br); }
textarea { resize: vertical; }
.hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.foot { display: flex; align-items: center; justify-content: flex-end; gap: 14px; flex-wrap: wrap; }
.err { color: var(--coral); font-size: 13px; margin-right: auto; }
.ok { background: var(--purple-wash); color: var(--ink-strong); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; font-family: var(--f-m); }
button:disabled { opacity: 0.6; cursor: default; }
</style>
