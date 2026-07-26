<script setup lang="ts">
/**
 * The contact module: the owner's links, plus one way to reach him.
 *
 * "One way" is the change. This used to render the form unconditionally and
 * discover on submit whether the relay existed — so a deployment without SMTP
 * showed a form that looked like it worked, accepted a typed message, and only
 * then answered "not configured". The capability is knowable before the page
 * renders, so the server resolves it into `channel` and this switches on it: a
 * form when the relay is configured, a mailto when it isn't, and neither when
 * there's no address to offer either.
 *
 * The branch is exhaustive over the union rather than an `v-if`/`v-else` on two
 * booleans, so a fourth channel can't be added without this failing to compile.
 */
import { computed } from "vue";
import type { ResolvedModule } from "@lg/core";
import { icons } from "../../lib/icons";
import { trackClick } from "../../lib/track";
import { useT } from "~/composables/useT";
import SmartLink from "../ui/SmartLink.vue";
import ModuleSection from "../ui/ModuleSection.vue";
import ContactForm from "../forms/ContactForm.vue";

const props = defineProps<{
  module: Extract<ResolvedModule, { kind: "contact" }>;
}>();

const { t } = useT();

// The social links, minus in-page anchors — a "#contact" link inside the contact
// section points at itself.
const links = computed(() => props.module.data.links.filter((l) => !l.href.startsWith("#")));

const channel = computed(() => props.module.data.channel);

/**
 * The mailto, with a subject prefilled.
 *
 * Encoded rather than interpolated: an address is user-editable content in the
 * CMS's sense of the word, and an unencoded one would let a stray `?` or `&`
 * silently turn the rest of the address into mail headers.
 */
const mailtoHref = computed(() =>
  channel.value.kind === "mailto"
    ? `mailto:${encodeURIComponent(channel.value.email)}?subject=${encodeURIComponent("letsgaming.de")}`
    : "",
);
</script>

<template>
  <ModuleSection :id="module.id" :heading="module.data.heading">
    <div v-if="links.length" class="links">
      <SmartLink
        v-for="l in links"
        :key="l.id"
        class="btn"
        :class="l.primary ? 'btn-primary' : 'btn-ghost'"
        :href="l.href"
        @click="trackClick('social')"
      >
        <span v-if="l.iconSvg" class="lico" v-html="l.iconSvg" /><span v-else-if="l.icon" v-html="icons[l.icon]" />{{ l.label }}
      </SmartLink>
    </div>

    <div v-if="channel.kind === 'form'" class="reply"><ContactForm /></div>

    <!-- No relay, but an address worth publishing. A real anchor, so it works
         without JavaScript and can be copied or opened in whatever the visitor
         actually uses for mail. -->
    <div v-else-if="channel.kind === 'mailto'" class="reply">
      <a class="btn btn-primary" :href="mailtoHref" @click="trackClick('social')">
        <span v-html="icons.mail" />{{ t("contactEmailMe") }}
      </a>
    </div>
  </ModuleSection>
</template>

<style scoped>
/* The reply affordance — form or button — sits below the links either way, so the
   spacing belongs here rather than inline on the form as it was. */
.reply {
  margin-top: var(--sp-20);
}
</style>
