import { computed, ref } from "vue";
import { AREA, PREVIEW_PARAM } from "@lg/core";
import type { AreaId } from "@lg/core";
import type { View } from "./useCmsNav";

/**
 * The live preview: an iframe of the actual site, aimed at the area you're
 * editing.
 *
 * Lifted out of `useCms` alongside the nav. It owns which area the preview points
 * at, the cache-busting key, and whether the side-by-side dock is open — a small,
 * self-contained concern that was interleaved with auth and content state.
 *
 * Content panels map to the site area that renders them, so the preview shows
 * "what you're working on" rather than the whole site. Panels with no site
 * counterpart (the library, analytics) leave the preview where it was.
 */
const AREA_FOR_VIEW: Partial<Record<View, AreaId>> = {
  site: AREA.home,
  home: AREA.home,
  about: AREA.about,
  links: AREA.about,
  hobbies: AREA.life,
  now: AREA.life,
  gallery: AREA.life,
  presence: AREA.life,
  music: AREA.life,
  playtime: AREA.life,
};

/**
 * Where the preview points.
 *
 * Areas are routes (ADR 0003), so this is `/life`, not `/#life`. Both of these
 * once built a hash after the tab store and its `location.hash` reader were
 * deleted — a URL nothing reads, so every preview and every "view site" opened
 * Home regardless of the panel. Nothing failed: a hash to nowhere is a valid URL.
 *
 * `areaPath` rather than `areaHref(site.nav, id)`: the CMS doesn't hold the
 * resolved nav, and the first area is the root.
 */
const areaPath = (id: AreaId): string => (id === AREA.home ? "/" : `/${id}`);

export function useCmsPreview() {
  const previewArea = ref<AreaId>(AREA.home);
  /** Bumped on every successful save; the iframe keys off it and reloads. */
  const previewKey = ref(0);
  const showDock = ref(false);

  const previewSrc = computed(() => `${areaPath(previewArea.value)}?${PREVIEW_PARAM}=1`);

  /** Point the preview at whatever area the newly-opened panel edits. */
  function followView(view: View) {
    const area = AREA_FOR_VIEW[view];
    if (area) previewArea.value = area;
  }

  function invalidate() {
    previewKey.value++;
  }

  function viewSite() {
    window.open(areaPath(previewArea.value), "_blank", "noopener");
  }

  return { previewArea, previewKey, showDock, previewSrc, followView, invalidate, viewSite };
}
