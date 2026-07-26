<script setup lang="ts">
import { ref } from "vue";
import BaseForm from "./BaseForm.vue";
import { useSubmit } from "../../composables/useSubmit";
import { FIELD_LIMITS } from "@lg/core";
import { useT } from "~/composables/useT";

const { t } = useT();

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
  // The 503 is close to unreachable now — the section only renders this form when
  // the server said the relay is configured. Kept because "close to" isn't
  // "never": SSR resolved the capability at render time, and a deployment can lose
  // its relay between that render and a submit minutes later.
  message: (status) =>
    status === 503 ? t("contactUnconfigured") : status === 429 ? t("contactTooMany") : undefined,
});
</script>

<template>
  <BaseForm
    :state="state"
    :error="error"
    :submit-label='t("contactSend")'
    :sending-label='t("contactSending")'
    @submit="submit"
  >
    <template #success>{{ t("contactSent") }}</template>
    <div class="grid">
      <label>{{ t("contactFormName") }}<input v-model="name" required :maxlength="FIELD_LIMITS.contactName" autocomplete="name" /></label>
      <label>{{ t("contactFormEmail") }}<input v-model="email" type="email" required :maxlength="FIELD_LIMITS.contactEmail" autocomplete="email" /></label>
    </div>
    <label>{{ t("contactFormMessage") }}<textarea v-model="message" required :maxlength="FIELD_LIMITS.contactMessage" rows="4" /></label>
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
