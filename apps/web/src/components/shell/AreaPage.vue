<script setup lang="ts">
/**
 * One area per document, the dashboard shell shared by `/` and `/[area]`.
 *
 * Previously every area was SSR'd into every page and the inactive ones hidden
 * with `[hidden]`, which meant the whole site shipped in the HTML of each page, no
 * URL ever changed, and a draft area would have shipped its markup to anyone
 * reading source. Routes fix all three; that stays true here.
 *
 * The `client:idle` directives that used to wrap SiteChrome and SitePanels are
 * gone, this is one Vue app now, so the components simply hydrate with the page.
 */
import { computed, provide } from "vue";
import { AREA, type Locale, type SiteView } from "@lg/core";
import { areaById, areaHref, areaMeta } from "~/lib/area";
import { useLocale, useT } from "~/composables/useT";
import { useSeo } from "~/composables/useSeo";
import { useRenderedLocale } from "~/composables/useSiteRequest";
import { SYNCED_RELATIVE_KEY } from "~/composables/syncedContext";
import SiteChrome from "./SiteChrome.vue";
import SitePanels from "./SitePanels.vue";
import LiveStrip from "./LiveStrip.vue";
import SmartLink from "~/components/ui/SmartLink.vue";

const props = defineProps<{
  site: SiteView;
  /** The locale the server actually rendered in, drives <html lang>. */
  locale: Locale;
  /** Route segment; omitted on `/`, which is the first area. */
  area?: string;
}>();

const area = computed(() => areaById(props.site.nav, props.area));

// The locale SSR actually rendered in, published for the UI-string catalog.
// Set during setup so it's identical on the server and on hydration.
useLocale().value = props.locale;
useRenderedLocale().value = props.locale;
const { t } = useT();

// Per-area <title>/description, so a link pasted into a chat unfurls as the thing
// it points at rather than as the homepage.
const isHome = computed(() => area.value?.id === props.site.nav[0]?.id);
const meta = computed(() =>
  areaMeta(area.value, props.site.meta.name, props.site.meta.role, isHome.value),
);

// `data-locale-aware` opts this page into the locale redirect in nuxt.config;
// the prerendered docs ignore ?lang and so must not carry it.
useHead(() => ({ htmlAttrs: { lang: props.locale, "data-locale-aware": "1" } }));

// The full SEO surface, <title>/description, canonical, hreflang for both
// locales, Open Graph, Twitter card, and Person + WebSite JSON-LD, built from
// the clean area path so `?lang`/`?ref` permutations all canonicalize to one URL.
useSeo({
  site: props.site,
  locale: props.locale,
  path: areaHref(props.site.nav, area.value?.id ?? props.site.nav[0]?.id ?? ""),
  title: meta.value.title,
  description: meta.value.description,
  // Areas are the only pages that genuinely render in both languages from one
  // URL, so they're the only ones that may claim hreflang alternates.
  localized: true,
});

// The hero's own liveness caption ("synced 8m ago"), see syncedContext.ts for
// why this is provide/inject rather than a prop threaded through Module.vue's
// uniform sections[module.kind] dispatch.
provide(SYNCED_RELATIVE_KEY, props.site.syncedRelative);
</script>

<template>
  <main v-if="area">
    <a class="skip" href="#content">{{ t("skipToContent") }}</a>
    <div class="wrap">
      <!-- Every area needs exactly one <h1>. The `hero` module (home only) already
           renders one (display type, per DESIGN.md's "hero H1 only" rule), so a
           second, visible one here would both duplicate it site-wide and break that
           rule. Other areas get the area's name as a screen-reader-only heading
           instead: same document structure and SEO signal, no visual surface. -->
      <h1 v-if="!isHome" class="visually-hidden">{{ area.label }}</h1>
      <div class="top">
        <SmartLink class="brand" :href="areaHref(site.nav, site.nav[0]?.id ?? AREA.home)">
          {{ site.meta.name }}
        </SmartLink>
        <SiteChrome :nav="site.nav" :locale="site.locale" :current="area.id" />
      </div>

      <LiveStrip v-if="site.pulse" :pulse="site.pulse" :synced="site.syncedRelative" />

      <div id="content" tabindex="-1">
        <SitePanels :site="site" :area="area.id" />
      </div>

      <footer>
        <p v-if="site.syncedRelative && !site.pulse" class="foot-sync">{{ t("freshFresh", { age: site.syncedRelative }) }}</p>
        <nav class="foot-links" :aria-label='t("footerLabel")'>
          <span>@{{ site.meta.handle }}</span>
          <SmartLink href="/docs">{{ t("docs") }}</SmartLink>
          <SmartLink href="/datenschutz">{{ t("privacy") }}</SmartLink>
        </nav>
      </footer>
    </div>
  </main>
</template>
