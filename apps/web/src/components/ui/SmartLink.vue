<script setup lang="ts">
/**
 * The site's one link component (Nuxt). An on-site destination renders as
 * <NuxtLink> — client-side navigation with prefetch; an off-site destination
 * renders as <a target="_blank" rel="noreferrer noopener">. `class`, `@click`,
 * `aria-*` and the rest fall through to the rendered element, and the label is a
 * slot, so icon-plus-text buttons and whole card bodies compose unchanged.
 *
 * Two escape hatches for the cases the rule alone gets wrong:
 *   • `target` forces the tab behaviour — an OAuth sign-in must stay in-tab even
 *     though it's off-site (`target="_self"`); a preview should pop out even though
 *     it's on-site (`target="_blank"`). A forced target always uses a plain <a>.
 *   • `as` is the element rendered when there's no `href`, for the "a link when we
 *     have a URL, an inert styled row when we don't" pattern (default `span`).
 */
import { computed } from "vue";
import { isExternalHref } from "~/lib/url";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{ href?: string; as?: string; target?: string }>(),
  { as: "span" },
);

const siteUrl = useRuntimeConfig().public.siteUrl as string;
const external = computed(() => isExternalHref(props.href, siteUrl));

// In-app navigation (internal, no forced target) → <NuxtLink>. Anything else with
// an href → a plain <a>, with the target/rel the rule (or the override) dictates.
const useNuxtLink = computed(
  () => !!props.href && !external.value && props.target === undefined,
);
const anchorTarget = computed(
  () => props.target ?? (external.value ? "_blank" : undefined),
);
const rel = computed(() =>
  anchorTarget.value === "_blank" ? "noreferrer noopener" : undefined,
);
</script>

<template>
  <NuxtLink v-if="useNuxtLink" :to="href" v-bind="$attrs"><slot /></NuxtLink>
  <a
    v-else-if="href"
    :href="href"
    :target="anchorTarget"
    :rel="rel"
    v-bind="$attrs"
    ><slot
  /></a>
  <component :is="as" v-else v-bind="$attrs"><slot /></component>
</template>
