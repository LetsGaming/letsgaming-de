<script setup lang="ts">
import { ref } from "vue";
import BaseForm from "./BaseForm.vue";
import { useSubmit } from "../../composables/useSubmit";
import { FIELD_LIMITS } from "@lg/core";
import { useT } from "~/composables/useT";

const { t } = useT();

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
  message: (status) => (status === 429 ? t("guestbookTooMany") : undefined),
});
</script>

<template>
  <div class="gform-wrap">
    <BaseForm
      :state="state"
      :error="error"
      :submit-label='t("guestbookSend")'
      :sending-label='t("guestbookSending")'
      @submit="submit"
    >
      <template #success>{{ t("guestbookSent") }}</template>
      <label>{{ t("guestbookFormName") }}<input v-model="name" required :maxlength="FIELD_LIMITS.guestbookName" autocomplete="name" /></label>
      <label>{{ t("guestbookFormMessage") }}<textarea v-model="message" required :maxlength="FIELD_LIMITS.guestbookMessage" rows="3" /></label>
      <input v-model="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
    </BaseForm>
  </div>
</template>

<style scoped>
.gform-wrap { margin-top: var(--sp-18); }
</style>
