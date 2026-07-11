<script setup lang="ts">
import { ref } from "vue";
import BaseForm from "./BaseForm.vue";
import { useSubmit } from "../composables/useSubmit";
import { FIELD_LIMITS } from "@lg/core";

const name = ref("");
const message = ref("");
const website = ref(""); // honeypot — real users leave this empty

const { state, error, submit } = useSubmit({
  path: "/api/guestbook",
  track: "guestbook-submit",
  body: () => ({ name: name.value, message: message.value, website: website.value }),
  onSuccess: () => {
    name.value = message.value = "";
  },
  message: (status) =>
    status === 429
      ? "That's a few too many just now — please try again a little later."
      : undefined,
});
</script>

<template>
  <div class="gform-wrap">
    <BaseForm
      :state="state"
      :error="error"
      submit-label="Sign the guestbook"
      sending-label="Signing…"
      @submit="submit"
    >
      <template #success>
        Thanks for signing! Your note will appear here once I've had a chance to approve it.
      </template>
      <label>Name<input v-model="name" required :maxlength="FIELD_LIMITS.guestbookName" autocomplete="name" /></label>
      <label>Message<textarea v-model="message" required :maxlength="FIELD_LIMITS.guestbookMessage" rows="3" /></label>
      <input v-model="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
    </BaseForm>
  </div>
</template>

<style scoped>
.gform-wrap { margin-top: var(--sp-18); }
</style>
