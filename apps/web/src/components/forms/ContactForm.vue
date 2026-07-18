<script setup lang="ts">
import { ref } from "vue";
import BaseForm from "./BaseForm.vue";
import { useSubmit } from "../../composables/useSubmit";
import { FIELD_LIMITS } from "@lg/core";

const name = ref("");
const email = ref("");
const message = ref("");
const website = ref(""); // honeypot — real users leave this empty

const { state, error, submit } = useSubmit({
  path: "/api/contact",
  track: "contact-submit",
  body: () => ({ name: name.value, email: email.value, message: message.value, website: website.value }),
  onSuccess: () => {
    name.value = email.value = message.value = "";
  },
  message: (status) =>
    status === 503
      ? "The contact form isn't configured yet — email works below."
      : status === 429
        ? "Too many messages just now — please try again a little later."
        : undefined,
});
</script>

<template>
  <BaseForm
    :state="state"
    :error="error"
    submit-label="Send message"
    sending-label="Sending…"
    @submit="submit"
  >
    <template #success>Thanks — your message is on its way. I'll get back to you soon.</template>
    <div class="grid">
      <label>Name<input v-model="name" required :maxlength="FIELD_LIMITS.contactName" autocomplete="name" /></label>
      <label>Email<input v-model="email" type="email" required :maxlength="FIELD_LIMITS.contactEmail" autocomplete="email" /></label>
    </div>
    <label>Message<textarea v-model="message" required :maxlength="FIELD_LIMITS.contactMessage" rows="4" /></label>
    <input v-model="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
  </BaseForm>
</template>

<style scoped>
/* Only the contact-specific layout remains; shared styles live in BaseForm. */
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-12); }
@media (max-width: 520px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
