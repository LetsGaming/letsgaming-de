import { defineComponent, h } from "vue";
import { config } from "@vue/test-utils";

/**
 * Component tests mount pieces of the app directly, without the router Nuxt
 * installs at runtime — so `<NuxtLink>` renders a `<RouterLink>` that can't
 * resolve, and no anchor reaches the DOM at all.
 *
 * Stubbing it as a plain anchor keeps the assertions meaningful: the nav tests
 * are about there being one real link per area, carrying the right `href` and
 * `aria-current`. `SmartLink` sets `inheritAttrs: false` and forwards `$attrs`,
 * so `class` and `aria-current` land on this `<a>` exactly as they do in the
 * browser.
 *
 * A render function rather than a `template`, so the stub never depends on the
 * runtime template compiler being present in the test build.
 */
const NuxtLinkStub = defineComponent({
  name: "NuxtLinkStub",
  props: {
    to: { type: [String, Object], default: "" },
  },
  setup(props, { slots }) {
    return () =>
      h("a", { href: typeof props.to === "string" ? props.to : String(props.to) }, slots.default?.());
  },
});

config.global.stubs = { NuxtLink: NuxtLinkStub };
